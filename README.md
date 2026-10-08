# 🎓 CertifyPro - Batch Certificate Studio & Generator

An interactive web application and high-precision vector PDF generation engine that overlays recipient data onto master certificate templates and saves them directly into your local folder.

---

## 🌟 Features

- 🎯 **Interactive Drag & Drop Canvas**: Place the candidate name, course, date, or ID bounding boxes visually on `Certificate-Master.pdf` with real-time coordinate translation.
- ✍️ **Custom Typography**: Built-in support for calligraphy scripts (*Great Vibes*, *Alex Brush*), elegant serifs (*Playfair Display*, *Cinzel*), modern sans (*Montserrat*), and standard fonts.
- 📁 **Direct Local Disk Saving**: Automatically creates and writes individual PDF files directly into `./output/` (or any custom folder path you choose) on your computer.
- 📊 **Flexible Data Import**:
  - **Quick Paste**: Paste lists of names (one per line).
  - **Excel / CSV Upload**: Drag and drop `.xlsx` / `.csv` spreadsheets with automatic column mapping.
  - **Sample Data**: One-click demo dataset with 8 pre-loaded recipients.
- 👁️ **Live Vector Preview**: Instant vector PDF sample preview without downloading.
- 📦 **One-Click ZIP Export**: Download all generated certificates in a single compressed `.zip` archive.
- 📂 **Native File Manager Integration**: Open the generated output folder directly in macOS Finder with one click.

---

## 🚀 Quick Start

### 1. Start the Web App
Run the following command in your terminal:
```bash
npm start
```

### 2. Open in Browser
Navigate to:
```
http://localhost:3001
```

---

## 🗂️ Project Structure

```
├── Certificate-Master.pdf      # Default master certificate template
├── fonts/                      # TrueType font files (Great Vibes, Alex Brush, Montserrat, etc.)
├── output/                     # Destination folder where generated PDFs are saved
├── public/                     # Frontend client
│   ├── app.js                  # Canvas rendering, drag-and-drop & API communication
│   ├── index.html              # Main application interface
│   └── style.css               # Modern dark-mode & glassmorphism styling
├── templates/                  # Uploaded certificate templates
├── package.json                # Project dependencies & scripts
└── server.js                   # Express + pdf-lib backend generation engine
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, `pdf-lib`, `@pdf-lib/fontkit`, `archiver`, `xlsx`, `multer`
- **Frontend**: Vanilla JavaScript (ES6+), PDF.js, SheetJS, Lucide Icons, Custom CSS Design System
