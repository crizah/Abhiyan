// src/config/theme.js
// Single brand accent: Deep Rose. Keep every other surface neutral (zinc/off-black)
// so the accent stays the only color statement in the UI.
const deepRose = '#B3455C';
const deepRoseHover = '#9A3A4E';
const deepRoseActive = '#7F2F40';

export const customTheme = {
  token: {
    fontFamily: `'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    colorPrimary: deepRose,
    colorTextBase: '#18181B', // Zinc-900 off-black, never pure #000
    colorBgBase: '#ffffff',
    colorBgLayout: '#F7F5F2', // warm off-white, less stark than pure white
    borderRadius: 10,
    wireframe: false,
  },
  components: {
    Button: {
      colorPrimary: deepRose,
      colorPrimaryHover: deepRoseHover,
      colorPrimaryActive: deepRoseActive,
    },
    Input: {
      activeBorderColor: deepRose,
      hoverBorderColor: deepRose,
    }
  }
};