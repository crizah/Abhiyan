// src/config/theme.js
export const customTheme = {
  token: {
    fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    colorPrimary: '#F5A623', // Pale Orange accent
    colorInfo: '#1A365D',    // Navy Blue accent
    colorTextBase: '#1f2937', // Dark Grey/Black for text
    colorBgBase: '#ffffff',
    colorBgLayout: '#f9fafb', // Light grey for app background
    borderRadius: 6,
    wireframe: false,
  },
  components: {
    Button: {
      colorPrimary: '#F5A623',
      colorPrimaryHover: '#E09612',
      colorPrimaryActive: '#CC8810',
    },
    Input: {
      activeBorderColor: '#1A365D',
      hoverBorderColor: '#1A365D',
    }
  }
};