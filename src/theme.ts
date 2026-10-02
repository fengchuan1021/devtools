import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

export const appTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e6f4fb',
      100: '#cce8f6',
      200: '#99d1ee',
      300: '#1a94d4',
      400: '#007acc',
      500: '#007acc',
      600: '#0e639c',
      700: '#0a4f7c',
      800: '#063656',
      900: '#041f33',
      950: '#02121d',
    },
    colorScheme: {
      dark: {
        primary: {
          color: '#007acc',
          contrastColor: '#ffffff',
          hoverColor: '#1a94d4',
          activeColor: '#0e639c',
        },
      },
    },
  },
})
