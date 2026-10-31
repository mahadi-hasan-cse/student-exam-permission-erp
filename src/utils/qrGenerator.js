const QRCode = require('qrcode');

async function generateQRCodeDataURL(text) {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 200,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('QR code generation error:', err);
    throw err;
  }
}

module.exports = {
  generateQRCodeDataURL,
};
