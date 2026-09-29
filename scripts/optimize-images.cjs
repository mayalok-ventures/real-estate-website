const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imagesDir = path.join(process.cwd(), 'public', 'images');

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (item.endsWith('.png') || item.endsWith('.jpg') || item.endsWith('.jpeg')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function optimizeImages() {
  const files = getFiles(imagesDir);
  console.log(`[optimize-images] Found ${files.length} images to optimize...`);

  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const file of files) {
    const origStat = fs.statSync(file);
    const origSize = origStat.size;
    totalOriginal += origSize;

    const ext = path.extname(file).toLowerCase();
    const isLogo = file.includes('sahyak-logo');

    try {
      let pipeline = sharp(file);
      const meta = await pipeline.metadata();

      // Resize excessively large dimensions
      if (isLogo && meta.width > 512) {
        pipeline = pipeline.resize({ width: 512, height: 512, fit: 'inside' });
      } else if (meta.width > 1920) {
        pipeline = pipeline.resize({ width: 1920, withoutEnlargement: true });
      }

      // 1. Generate WebP alongside
      const webpPath = file.slice(0, -ext.length) + '.webp';
      await pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(webpPath);

      // 2. Optimize original PNG/JPG in-place using temporary file
      const tempPath = file + '.tmp';
      if (ext === '.png') {
        await pipeline.clone().png({ compressionLevel: 9, quality: 80, effort: 7 }).toFile(tempPath);
      } else {
        await pipeline.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(tempPath);
      }

      const newStat = fs.statSync(tempPath);
      if (newStat.size < origSize) {
        fs.copyFileSync(tempPath, file);
        totalOptimized += newStat.size;
        console.log(`[optimized] ${path.relative(process.cwd(), file)}: ${(origSize/1024).toFixed(0)}KB -> ${(newStat.size/1024).toFixed(0)}KB (WebP: ${(fs.statSync(webpPath).size/1024).toFixed(0)}KB)`);
      } else {
        totalOptimized += origSize;
        console.log(`[retained] ${path.relative(process.cwd(), file)}: already optimal`);
      }
      fs.unlinkSync(tempPath);

    } catch (err) {
      console.error(`[error] Failed optimizing ${file}:`, err.message);
      totalOptimized += origSize;
    }
  }

  console.log(`\n=================================================`);
  console.log(`Total Original Size:  ${(totalOriginal / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Optimized Size: ${(totalOptimized / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Savings:        ${((totalOriginal - totalOptimized) / (1024 * 1024)).toFixed(2)} MB (${(((totalOriginal - totalOptimized) / totalOriginal) * 100).toFixed(1)}%)`);
  console.log(`=================================================`);
}

optimizeImages();
