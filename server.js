const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { exec, execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const WORKSPACE_DIR = __dirname;
const TEMPLATES_DIR = path.join(WORKSPACE_DIR, 'templates');
const FONTS_DIR = path.join(WORKSPACE_DIR, 'fonts');
const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'output');
const PUBLIC_DIR = path.join(WORKSPACE_DIR, 'public');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Copy Master certificate if in root to templates
const defaultMasterInRoot = path.join(WORKSPACE_DIR, 'Certificate-Master.pdf');
const defaultMasterInTemplates = path.join(TEMPLATES_DIR, 'Certificate-Master.pdf');
if (fs.existsSync(defaultMasterInRoot) && !fs.existsSync(defaultMasterInTemplates)) {
  fs.copyFileSync(defaultMasterInRoot, defaultMasterInTemplates);
}

// Disable caching during development to ensure instant updates
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve public static assets
app.use(express.static(PUBLIC_DIR));
app.use('/fonts', express.static(FONTS_DIR));

// Configure Multer for template upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });

// Font definitions
const AVAILABLE_FONTS = [
  { id: 'GreatVibes', name: 'Great Vibes (Calligraphy Script)', file: 'GreatVibes-Regular.ttf', fallback: 'cursive' },
  { id: 'AlexBrush', name: 'Alex Brush (Elegant Brush Script)', file: 'AlexBrush-Regular.ttf', fallback: 'cursive' },
  { id: 'Montserrat', name: 'Montserrat (Modern Bold Sans)', file: 'Montserrat-Bold.ttf', fallback: 'sans-serif' },
  { id: 'PlayfairDisplay', name: 'Playfair Display (Classic Serif)', file: 'PlayfairDisplay-Bold.ttf', fallback: 'serif' },
  { id: 'Cinzel', name: 'Cinzel (Formal Decorative Serif)', file: 'Cinzel-Bold.ttf', fallback: 'serif' },
  { id: 'Helvetica', name: 'Helvetica (Standard Clean)', file: null, standard: StandardFonts.Helvetica },
  { id: 'TimesRoman', name: 'Times Roman (Standard Academic)', file: null, standard: StandardFonts.TimesRoman }
];

// Hex to RGB helper (0.0 - 1.0)
function hexToRgb(hex) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
  return rgb(r, g, b);
}

// Get active template path
function getActiveTemplatePath(customName) {
  if (customName && fs.existsSync(path.join(TEMPLATES_DIR, customName))) {
    return path.join(TEMPLATES_DIR, customName);
  }
  if (fs.existsSync(defaultMasterInTemplates)) {
    return defaultMasterInTemplates;
  }
  if (fs.existsSync(defaultMasterInRoot)) {
    return defaultMasterInRoot;
  }
  // Find any pdf in templates
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (files.length > 0) {
    return path.join(TEMPLATES_DIR, files[0]);
  }
  return null;
}

// Helper to embed requested font into PDFDocument
async function getEmbeddedFont(pdfDoc, fontId) {
  const fontDef = AVAILABLE_FONTS.find(f => f.id === fontId) || AVAILABLE_FONTS[0];
  if (fontDef.file) {
    const fontFilePath = path.join(FONTS_DIR, fontDef.file);
    if (fs.existsSync(fontFilePath)) {
      pdfDoc.registerFontkit(fontkit);
      const fontBytes = fs.readFileSync(fontFilePath);
      return await pdfDoc.embedFont(fontBytes);
    }
  }
  // Standard fallback
  const standardKey = fontDef.standard || StandardFonts.Helvetica;
  return await pdfDoc.embedFont(standardKey);
}

// Core PDF Generation for a single record
async function renderCertificate(templateBytes, recordData, fieldConfigs) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Cache embedded fonts for this doc
  const fontCache = {};

  for (const field of fieldConfigs) {
    const fieldKey = field.key || 'name';
    let rawText = recordData[fieldKey];
    if (rawText === undefined || rawText === null) {
      rawText = field.defaultValue || '';
    }
    let textToDraw = String(rawText).trim();
    if (!textToDraw) continue;

    // Normalize unicode punctuation characters to prevent encoding crashes
    textToDraw = textToDraw
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2026]/g, '...')
      .replace(/[\u00A0]/g, ' ');

    const fontId = field.fontId || 'PlayfairDisplay';
    if (!fontCache[fontId]) {
      fontCache[fontId] = await getEmbeddedFont(pdfDoc, fontId);
    }
    let font = fontCache[fontId];

    const fontSize = parseFloat(field.fontSize) || 30;
    const fontColor = hexToRgb(field.color || '#800020');

    let textWidth = 0;
    let textHeight = fontSize;
    try {
      textWidth = font.widthOfTextAtSize(textToDraw, fontSize);
      textHeight = font.heightAtSize(fontSize);
    } catch (encErr) {
      console.warn(`Font encoding error for "${fontId}", falling back to Standard Helvetica:`, encErr.message);
      if (!fontCache['__helveticaFallback']) {
        fontCache['__helveticaFallback'] = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
      font = fontCache['__helveticaFallback'];
      textToDraw = textToDraw.replace(/[^\x20-\x7E]/g, ' ');
      textWidth = font.widthOfTextAtSize(textToDraw, fontSize);
      textHeight = font.heightAtSize(fontSize);
    }

    // Coordinate conversion (accounting for PDF MediaBox origin e.g. Canva/Illustrator non-zero offsets)
    const mediaBox = page.getMediaBox();
    const originX = mediaBox ? (mediaBox.x || 0) : 0;
    const originY = mediaBox ? (mediaBox.y || 0) : 0;

    let targetX = originX + (parseFloat(field.x) || 0);
    let targetY = originY + (parseFloat(field.y) || 0);

    if (field.isTopLeftOrigin) {
      targetY = originY + pageHeight - parseFloat(field.y) - textHeight;
    }

    const align = field.align || 'center';
    if (align === 'center') {
      targetX = targetX - (textWidth / 2);
    } else if (align === 'right') {
      targetX = targetX - textWidth;
    }

    const baselineY = targetY - (fontSize * 0.28);

    try {
      page.drawText(textToDraw, {
        x: targetX,
        y: baselineY,
        size: fontSize,
        font: font,
        color: fontColor
      });
    } catch (drawErr) {
      console.warn('drawText fallback error:', drawErr.message);
    }
  }

  return await pdfDoc.save();
}

// ================= API ROUTES =================

// 1. Get Template Info & Dimensions
app.get('/api/template-info', async (req, res) => {
  try {
    const templatePath = getActiveTemplatePath(req.query.template);
    if (!templatePath) {
      return res.status(404).json({ error: 'Master certificate template not found.' });
    }
    const bytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();

    res.json({
      success: true,
      filename: path.basename(templatePath),
      width,
      height,
      aspectRatio: width / height,
      pageCount: pdfDoc.getPageCount()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to rasterize PDF page into high-res preview image preserving exact provided dimensions & full Bleed/CropBox
function getOrGenerateTemplatePreview(pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return null;
  const baseName = path.basename(pdfPath, '.pdf');
  const previewPath = path.join(TEMPLATES_DIR, `${baseName}_preview.png`);
  if (!fs.existsSync(previewPath) || fs.statSync(pdfPath).mtime > fs.statSync(previewPath).mtime) {
    let generated = false;

    // 1. Primary engine: macOS QuickLook (qlmanage)
    // Perfectly respects non-zero PDF MediaBox/CropBox offsets (e.g. Canva/Illustrator exports) with zero top clipping or white patches
    try {
      let targetW = 1684;
      try {
        const out = execSync(`sips -g pixelWidth "${pdfPath}" 2>/dev/null`, { encoding: 'utf8' });
        const match = out.match(/pixelWidth:\s*([0-9.]+)/);
        if (match && parseFloat(match[1]) > 0) {
          targetW = Math.round(parseFloat(match[1]) * 2);
        }
      } catch (_) {}

      const tempDir = path.join(TEMPLATES_DIR, `__ql_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      execSync(`qlmanage -t -s ${targetW} -o "${tempDir}" "${pdfPath}" 2>/dev/null`, { stdio: 'ignore' });
      const qlGenerated = path.join(tempDir, `${path.basename(pdfPath)}.png`);
      if (fs.existsSync(qlGenerated)) {
        fs.copyFileSync(qlGenerated, previewPath);
        generated = true;
      }
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    } catch (e) {
      console.warn('qlmanage preview generation error, falling back to sips:', e.message);
    }

    // 2. Fallback engine: sips
    if (!generated) {
      try {
        let resampleArg = '';
        try {
          const out = execSync(`sips -g pixelWidth "${pdfPath}" 2>/dev/null`, { encoding: 'utf8' });
          const match = out.match(/pixelWidth:\s*([0-9.]+)/);
          if (match && parseFloat(match[1]) > 0) {
            resampleArg = `--resampleWidth ${Math.round(parseFloat(match[1]) * 2)}`;
          }
        } catch (_) {}

        const tempJpg = path.join(TEMPLATES_DIR, `${baseName}_stage_${Date.now()}.jpg`);
        const cmdJpg = resampleArg
          ? `sips -s format jpeg ${resampleArg} "${pdfPath}" --out "${tempJpg}"`
          : `sips -s format jpeg "${pdfPath}" --out "${tempJpg}"`;
        execSync(cmdJpg, { stdio: 'ignore' });
        execSync(`sips -s format png "${tempJpg}" --out "${previewPath}"`, { stdio: 'ignore' });

        if (fs.existsSync(tempJpg)) {
          try { fs.unlinkSync(tempJpg); } catch (_) {}
        }
      } catch (err) {
        console.warn('sips fallback error:', err.message);
      }
    }
  }
  return fs.existsSync(previewPath) ? previewPath : null;
}

// 2. Serve Template PDF file directly
app.get('/api/template-file', (req, res) => {
  const templatePath = getActiveTemplatePath(req.query.template);
  if (!templatePath) return res.status(404).send('Template not found');
  res.sendFile(templatePath);
});

// 2b. Serve High-Resolution Template Preview Image (Fast & 100% Reliable in all browsers)
app.get('/api/template-image', (req, res) => {
  const templatePath = getActiveTemplatePath(req.query.template);
  if (!templatePath) return res.status(404).send('Template not found');
  const previewImgPath = getOrGenerateTemplatePreview(templatePath);
  if (previewImgPath && fs.existsSync(previewImgPath)) {
    return res.sendFile(previewImgPath);
  }
  res.status(404).send('Preview image not available');
});

// 3. Upload new custom template (Replaces Master Certificate)
app.post('/api/upload-template', upload.single('template'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const bytes = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();

    // Create backup of current master if it exists
    if (fs.existsSync(defaultMasterInTemplates)) {
      try {
        fs.copyFileSync(defaultMasterInTemplates, path.join(TEMPLATES_DIR, 'Certificate-Master-backup.pdf'));
      } catch (_) {}
    }

    // Overwrite master PDF in templates and workspace root
    fs.copyFileSync(req.file.path, defaultMasterInTemplates);
    fs.copyFileSync(req.file.path, defaultMasterInRoot);

    // Remove old cached preview PNGs to force regeneration
    const masterPreviewPath = path.join(TEMPLATES_DIR, 'Certificate-Master_preview.png');
    if (fs.existsSync(masterPreviewPath)) {
      try { fs.unlinkSync(masterPreviewPath); } catch (_) {}
    }
    const rootPreviewPath = path.join(WORKSPACE_DIR, 'template_preview.png');
    if (fs.existsSync(rootPreviewPath)) {
      try { fs.unlinkSync(rootPreviewPath); } catch (_) {}
    }

    // Immediately regenerate high-res preview image with macOS sips
    getOrGenerateTemplatePreview(defaultMasterInTemplates);

    res.json({
      success: true,
      filename: 'Certificate-Master.pdf',
      originalName: req.file.originalname,
      width,
      height
    });
  } catch (err) {
    console.error('Template upload error:', err);
    res.status(500).json({ error: 'Invalid PDF: ' + err.message });
  }
});

// 4. Get Font list
app.get('/api/fonts', (req, res) => {
  res.json({ success: true, fonts: AVAILABLE_FONTS });
});

// 5. Generate Preview PDF
app.post('/api/preview', async (req, res) => {
  try {
    const { template, sampleRecord, fields } = req.body;
    const templatePath = getActiveTemplatePath(template);
    if (!templatePath) return res.status(404).json({ error: 'Template not found' });

    const templateBytes = fs.readFileSync(templatePath);
    const pdfBytes = await renderCertificate(
      templateBytes,
      sampleRecord || { name: 'Dr. Elizabeth Montgomery', course: 'Advanced Machine Learning & AI', date: 'October 24, 2026', certId: 'CERT-2026-9841' },
      fields || []
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Batch Generation to Local Disk Folder
app.post('/api/generate-batch', async (req, res) => {
  try {
    const { records, fields, outputFolder, template, filenameKey } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'No records provided for generation.' });
    }

    const templatePath = getActiveTemplatePath(template);
    if (!templatePath) return res.status(404).json({ error: 'Template not found.' });
    const templateBytes = fs.readFileSync(templatePath);

    const targetDir = outputFolder && outputFolder.trim() 
      ? (path.isAbsolute(outputFolder) ? outputFolder : path.join(WORKSPACE_DIR, outputFolder))
      : OUTPUT_DIR;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const generatedFiles = [];
    const usedNames = new Set();

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const primaryValue = record[filenameKey || 'name'] || `Certificate_${i + 1}`;
      let safeBaseName = String(primaryValue).trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_');
      if (!safeBaseName) safeBaseName = `Certificate_${i + 1}`;

      // Avoid collision
      let finalName = `${safeBaseName}.pdf`;
      let counter = 1;
      while (usedNames.has(finalName.toLowerCase())) {
        finalName = `${safeBaseName}_${counter}.pdf`;
        counter++;
      }
      usedNames.add(finalName.toLowerCase());

      const pdfBytes = await renderCertificate(templateBytes, record, fields);
      const filePath = path.join(targetDir, finalName);
      fs.writeFileSync(filePath, pdfBytes);

      generatedFiles.push({
        filename: finalName,
        path: filePath,
        size: pdfBytes.length,
        recipient: record.name || primaryValue
      });
    }

    res.json({
      success: true,
      count: generatedFiles.length,
      outputDir: targetDir,
      files: generatedFiles
    });
  } catch (err) {
    console.error('Batch generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Download all generated certificates as a single ZIP
app.post('/api/download-zip', async (req, res) => {
  try {
    const { records, fields, template, filenameKey } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'No records provided.' });
    }

    const templatePath = getActiveTemplatePath(template);
    if (!templatePath) return res.status(404).json({ error: 'Template not found.' });
    const templateBytes = fs.readFileSync(templatePath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="Certificates_Batch.zip"');

    const archive = typeof archiver === 'function' 
      ? archiver('zip', { zlib: { level: 9 } })
      : new (archiver.ZipArchive || archiver.Archiver)({ zlib: { level: 9 } });
    archive.pipe(res);

    const usedNames = new Set();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const primaryValue = record[filenameKey || 'name'] || `Certificate_${i + 1}`;
      let safeBaseName = String(primaryValue).trim().replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_');
      if (!safeBaseName) safeBaseName = `Certificate_${i + 1}`;

      let finalName = `${safeBaseName}.pdf`;
      let counter = 1;
      while (usedNames.has(finalName.toLowerCase())) {
        finalName = `${safeBaseName}_${counter}.pdf`;
        counter++;
      }
      usedNames.add(finalName.toLowerCase());

      const pdfBytes = await renderCertificate(templateBytes, record, fields);
      archive.append(Buffer.from(pdfBytes), { name: finalName });
    }

    await archive.finalize();
  } catch (err) {
    console.error('ZIP error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// 8. Open output folder in Finder / File Explorer
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  const targetDir = folderPath && fs.existsSync(folderPath) ? folderPath : OUTPUT_DIR;

  const cmd = process.platform === 'darwin' ? `open "${targetDir}"`
            : process.platform === 'win32' ? `start "" "${targetDir}"`
            : `xdg-open "${targetDir}"`;

  exec(cmd, (err) => {
    if (err) {
      return res.json({ success: false, message: 'Could not open folder automatically', path: targetDir });
    }
    res.json({ success: true, message: 'Folder opened in File Manager', path: targetDir });
  });
});

// 9. List files in output directory
app.get('/api/list-output', (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.json({ success: true, files: [], outputDir: OUTPUT_DIR });
    }
    const fileNames = fs.readdirSync(OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    const files = fileNames.map(f => {
      const stat = fs.statSync(path.join(OUTPUT_DIR, f));
      return {
        filename: f,
        size: stat.size,
        modifiedAt: stat.mtime
      };
    }).sort((a, b) => b.modifiedAt - a.modifiedAt);

    res.json({ success: true, files, outputDir: OUTPUT_DIR });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🎓 Certificate Generator Web App Running!`);
  console.log(`  🌐 Local URL: http://localhost:${PORT}`);
  console.log(`  📁 Output Folder: ${OUTPUT_DIR}`);
  console.log(`======================================================\n`);
});
