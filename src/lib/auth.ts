import { createStorageHelpers, KVStorage } from './storage';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  tokenType?: string;
}

// Shared memory storage for development (persists across instances)
const developmentTokens = new Map<string, OAuthTokens>();

export class AdobeOAuth {
  // Adobe IMS endpoints - confirmed from Adobe documentation
  private static readonly ADOBE_AUTHORIZE_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
  private static readonly ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
  private static readonly ADOBE_REVOKE_URL = 'https://ims-na1.adobelogin.com/ims/revoke';
  private static readonly ADOBE_LOGOUT_URL = 'https://ims-na1.adobelogin.com/ims/logout';
  
  // Lightroom Partner API scopes - from official Lightroom Partner API documentation
  private static readonly LIGHTROOM_SCOPE = 'openid,AdobeID,lr_partner_apis,lr_partner_rendition_apis,offline_access';

  private storage: ReturnType<typeof createStorageHelpers> | null = null;
  
  constructor(private env: Env) {}
  
  private getStorage() {
    if (!this.storage) {
      this.storage = createStorageHelpers(this.env);
    }
    return this.storage;
  }

  private isProduction(): boolean {
    return this.env.ENVIRONMENT === 'production';
  }

  /**
   * Generate Adobe OAuth authorization URL
   * @param redirectUri - Must match exactly what's configured in Adobe Developer Console
   * @param state - Optional state parameter for CSRF protection
   */
  generateAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.ADOBE_CLIENT_ID!,
      redirect_uri: redirectUri,  // Standard OAuth parameter name
      response_type: 'code',
      scope: AdobeOAuth.LIGHTROOM_SCOPE
    });

    if (state) {
      params.set('state', state);
    }

    return `${AdobeOAuth.ADOBE_AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    if (!this.env.ADOBE_CLIENT_ID || !this.env.ADOBE_CLIENT_SECRET) {
      throw new Error('Adobe OAuth credentials not configured');
    }

    const response = await fetch(AdobeOAuth.ADOBE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: this.env.ADOBE_CLIENT_ID,
        client_secret: this.env.ADOBE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Adobe OAuth token exchange failed:', errorText);
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    
    if (!data.access_token) {
      throw new Error('No access token in OAuth response');
    }

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
      scope: data.scope,
      tokenType: data.token_type || 'Bearer'
    };

    console.log('About to store tokens:', {
      hasAccessToken: !!tokens.accessToken,
      accessTokenLength: tokens.accessToken?.length,
      hasRefreshToken: !!tokens.refreshToken,
      expiresAt: tokens.expiresAt
    });

    // Use KV in production, shared memory in development
    if (this.isProduction()) {
      await this.getStorage().kv.setOAuthTokens(tokens);
      console.log('Tokens stored in KV successfully');
    } else {
      developmentTokens.set('oauth', tokens);
      console.log('Tokens stored in shared memory for development');
    }
    
    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(): Promise<OAuthTokens> {
    let currentTokens;
    if (this.isProduction()) {
      currentTokens = await this.getStorage().kv.getOAuthTokens();
    } else {
      currentTokens = developmentTokens.get('oauth') || {};
    }
    
    if (!currentTokens.refreshToken) {
      throw new Error('No refresh token available - user needs to re-authenticate');
    }

    const response = await fetch(AdobeOAuth.ADOBE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: this.env.ADOBE_CLIENT_ID!,
        client_secret: this.env.ADOBE_CLIENT_SECRET!,
        refresh_token: currentTokens.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Adobe token refresh failed:', errorText);
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    
    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || currentTokens.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
      scope: data.scope,
      tokenType: data.token_type || 'Bearer'
    };

    // Save tokens based on environment
    if (this.isProduction()) {
      await this.getStorage().kv.setOAuthTokens(tokens);
    } else {
      developmentTokens.set('oauth', tokens);
    }
    return tokens;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string> {
    let tokens;
    
    // Use KV in production, shared memory in development
    if (this.isProduction()) {
      tokens = await this.getStorage().kv.getOAuthTokens();
    } else {
      tokens = developmentTokens.get('oauth');
    }
    
    if (!tokens || !tokens.accessToken) {
      throw new Error('No access token available - user needs to authenticate');
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(tokens.expiresAt || 0);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    if (expiresAt.getTime() - now.getTime() < bufferTime) {
      console.log('Access token expired, attempting refresh...');
      try {
        const refreshedTokens = await this.refreshTokens();
        return refreshedTokens.accessToken;
      } catch (error) {
        console.error('Token refresh failed:', error);
        throw new Error('Token expired and refresh failed - user needs to re-authenticate');
      }
    }

    return tokens.accessToken;
  }

  /**
   * Revoke all tokens and clear storage
   */
  async revokeTokens(): Promise<void> {
    let tokens;
    
    // Get tokens based on environment
    if (this.isProduction()) {
      tokens = await this.getStorage().kv.getOAuthTokens();
    } else {
      tokens = developmentTokens.get('oauth');
    }
    
    if (tokens?.accessToken) {
      try {
        await fetch(AdobeOAuth.ADOBE_REVOKE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            client_id: this.env.ADOBE_CLIENT_ID!,
            client_secret: this.env.ADOBE_CLIENT_SECRET!,
            token: tokens.accessToken
          })
        });
        console.log('Adobe tokens revoked successfully');
      } catch (error) {
        console.error('Failed to revoke tokens with Adobe:', error);
      }
    }

    // Clear tokens from storage
    if (this.isProduction()) {
      await this.getStorage().kv.setOAuthTokens({
        accessToken: '',
        refreshToken: '',
        expiresAt: new Date(0).toISOString()
      });
    } else {
      developmentTokens.delete('oauth');
      console.log('Development tokens cleared from memory');
    }
  }

  /**
   * Get Adobe logout URL to clear browser session
   */
  getLogoutUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.env.ADOBE_CLIENT_ID!,
      redirect_uri: redirectUri
    });
    return `${AdobeOAuth.ADOBE_LOGOUT_URL}?${params.toString()}`;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getValidAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Development authentication using simple password
 */
export class DevAuth {
  private sessions = new Map<string, number>(); // sessionToken -> expiresAt timestamp

  constructor(private env: Env) {}

  validatePassword(password: string): boolean {
    // No password required in development
    return true;
  }

  generateSessionToken(): string {
    return crypto.randomUUID();
  }

  async createSession(sessionToken: string): Promise<void> {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    this.sessions.set(sessionToken, expiresAt);
  }

  async validateSession(sessionToken: string): Promise<boolean> {
    if (!sessionToken) return false;
    
    const expiresAt = this.sessions.get(sessionToken);
    if (!expiresAt) return false;
    
    if (Date.now() > expiresAt) {
      this.sessions.delete(sessionToken);
      return false;
    }
    
    return true;
  }

  async revokeSession(sessionToken: string): Promise<void> {
    this.sessions.delete(sessionToken);
  }

  async isAuthenticated(sessionToken?: string): Promise<boolean> {
    if (!sessionToken) return false;
    return await this.validateSession(sessionToken);
  }
}

/**
 * Factory function to create appropriate auth provider based on environment
 */
export function createAuthProvider(env: Env) {
  // Use Adobe OAuth if credentials are available, otherwise fall back to DevAuth
  if (env.ADOBE_CLIENT_ID && env.ADOBE_CLIENT_SECRET) {
    return new AdobeOAuth(env);
  }
  
  // Use dev auth if Adobe credentials not available
  return new DevAuth(env);
}