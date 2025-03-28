const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const inputSvg = path.join(__dirname, '../src/icons/icon.svg');
const outputDir = path.join(__dirname, '../src/icons');

async function generateIcons() {
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 为每个尺寸生成 PNG
  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon${size}.png`);
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(outputFile);
    console.log(`Generated ${outputFile}`);
  }
}

generateIcons().catch(console.error); 