/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}',
  ],
  theme: {
    extend: {
      colors: {
        'raven': {
          '50': '#f5f7f8',
          '100': '#edf0f2',
          '200': '#dee4e7',
          '300': '#c9d2d8',
          '400': '#b2bec7',
          '500': '#9daab7',
          '600': '#8792a4',
          '700': '#6f7989',
          '800': '#5f6874',
          '900': '#50565f',
          '950': '#2f3337',
        },
        'lemon-grass': {
          '50': '#f5f6f3',
          '100': '#e9e9e2',
          '200': '#d2d3c7',
          '300': '#b1b4a1',
          '400': '#989c87',
          '500': '#6b7158',
          '600': '#525843',
          '700': '#424735',
          '800': '#36392c',
          '900': '#2b2f25',
          '950': '#181a14',
        },
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}