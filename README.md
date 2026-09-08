# PPTX Pro — Advanced Presentation & Document Suite

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Client--Side Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-green?logo=shield)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**PPTX Pro** is a web-based, browser-first presentation engineering suite and document processing engine. Built with **React 19** and **Vite**, PPTX Pro enables users to generate automated reports, design custom PowerPoint master templates, edit existing `.pptx` decks inline, convert & merge PDFs, extract high-res assets, and run optical character recognition (OCR) on presentation slides—**100% locally inside the browser with zero server uploads**.

---

## 🚀 Key Highlights & Special PPTX Functionality

PPTX Pro goes far beyond basic slide creation. It packs enterprise-grade PowerPoint manipulation features directly into client-side JavaScript:

1. **In-Place PPTX Tag & Content Editor**: Edit text tags, header titles, and image placeholders on existing `.pptx` presentations while preserving original XML slide structures, theme styles, fonts, and slide transition rules.
2. **Visual Master Template Designer & Preset Library**: Drag-and-drop canvas to visually position image placeholders, border radiuses, and custom textboxes onto master layouts. Export and share preset templates as `.pptxpro-template.json` files across teams.
3. **Smart PPTX Slide Parser & Importer**: Upload any `.pptx` deck to automatically extract slide contents, parse intro/outro slides, and map slot images into editable report forms.
4. **PPTX to PDF with Custom Area OCR**: Advanced slide conversion with a configurable scanning area using **Tesseract.js**. Scans custom bottom slide margins for GPS location coordinates or generates searchable text overlays for scanned documents.
5. **Dual-Variant Automated Municipal Reports**: Built-in template models tailored for municipal waste management, plot cleaning operations, desilting, and compliance tracking (including **Urban** 🏙️ and **Rural** 🏞️ report layout switches).
6. **100% Offline & Private Processing**: Powered by Web Workers, IndexedDB, Canvas API, `pptxgenjs`, `pdf-lib`, and `jszip`. No presentation data or uploaded images ever leave your device.
7. **Command Palette (`Ctrl + K` / `Cmd + K`)**: Quick search palette with keyboard shortcuts for instant jumping between all 10+ suite tools.

---

## 🧰 Comprehensive Tool Suite

The platform is organized into 3 core categories accessible via the top megamenu navigation or quick keyboard search:

```
PPTX Pro Suite
├── 📊 Presentation Reports
│   ├── Clean Punjab Report (Dual before/after photo slides)
│   ├── Compliance Report (Suthra Punjab tracking & verification)
│   ├── Desilting Report (3-stage sector desilting deck generator)
│   └── OTC Plot Report (Daily plot clearance - Urban & Rural variants)
├── 🎨 Custom Template Studio
│   └── Master Designer (Visual slide layout designer & template preset manager)
└── 🛠️ Media & Document Tools
    ├── PPTX to PDF (OCR Studio) (GPS & text extraction from slides)
    ├── PPTX Editor (Inline text/image tag editor preserving XML structure)
    ├── Collage Maker (2x3 & 3x3 photo grid generator for PPTX/ZIP)
    ├── PPTX to PDF Converter (Slide ordering, preview & instant export)
    ├── PDF to PPTX Converter (Convert PDF pages into PowerPoint decks)
    ├── Merge PDF Documents (Combine multiple PDFs with page reordering)
    ├── Merge Presentations (Merge multiple PPTX decks sequentially)
    └── Image Extractor (Extract high-res embedded graphics from PPTX files)
```

---

## 📖 Detailed Tool Breakdown

### 1. Presentation Reports (`/`, `/compliance`, `/desilting`, `/daily-plot`)
- **Automated Before/After Slide Generator**: Upload image pairs (Before & After) in bulk; PPTX Pro aligns them side-by-side on styled master slides.
- **Urban / Rural Layout Switcher**: Instantly toggle header formats, geographic field defaults, and color themes for urban vs. rural field reports.
- **Auto-Save & Hydration**: Work state is stored automatically in IndexedDB (`pptxpro:slides:v1`), allowing users to close the browser and resume uninterrupted.

### 2. Custom Template Studio (`/master`)
- **Visual Canvas Design**: Drag, resize, and position custom drop slots (`w`, `h`, `x`, `y` in inches or percentages) with configurable rounded corners.
- **Dynamic Textboxes**: Add unlimited header/footer text labels with customizable default values, font sizes, and alignments.
- **Preset Import/Export**: Save unlimited master presets locally or export them to `.pptxpro-template.json` to share with team members.

### 3. PPTX Editor (`/pptx-editor`)
- Upload any `.pptx` file to view individual slides and editable text/image tags.
- Modify text fields and swap embedded images without breaking layout coordinates or presentation formatting.

### 4. PPTX to PDF + OCR Studio (`/gps-pdf`)
- Extract slide images and pass customizable regions (e.g. bottom 20% of slide for timestamp/GPS overlays) into `tesseract.js`.
- Output searchable PDFs or structured location data.

### 5. Media & Grid Utilities (`/collage`, `/extract`, `/merge`)
- **Collage Maker**: Upload dozens of images, arrange in 2x3 or 3x3 grids, adjust cell gaps, and export directly as `.pptx` slides or a `.zip` archive.
- **Image Extractor**: Unzips `.pptx` OpenXML packages to inspect all internal media assets, allowing one-click download of original image files.
- **Merge PPTX & Merge PDF**: Combine multiple slide decks or PDF files into single consolidated documents with drag-and-drop page reordering.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend Core**: [React 19](https://react.dev/), [React DOM 19](https://react.dev/)
- **Build Tooling & Dev Server**: [Vite 8](https://vitejs.dev/)
- **Presentation Generation**: [PptxGenJS](https://gitbrent.github.io/PptxGenJS/)
- **OpenXML & Zip Handling**: [JSZip](https://stuk.github.io/jszip/)
- **PDF Manipulation**: [pdf-lib](https://pdf-lib.js.org/)
- **Optical Character Recognition**: [Tesseract.js](https://tesseract.projectnaptha.com/)
- **Client-Side Storage**: Native IndexedDB & LocalStorage wrappers
- **Styling**: Modern CSS3 (Glassmorphism, CSS Custom Properties, CSS Grids/Flexbox)

---

## 💻 Getting Started & Local Development

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/usman918dev/pptxpro.git
   cd pptxpro
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173` (or the URL displayed in the terminal).

4. **Build for Production**:
   ```bash
   npm run build
   ```
   The optimized production bundle will be generated in the `dist/` directory, ready for deployment to Vercel, Netlify, or static web servers.

---

## 📁 Project Structure

```
pptxpro/
├── index.html              # HTML5 entry point & metadata
├── package.json            # Project dependencies & scripts
├── vite.config.js          # Vite configuration
├── vercel.json             # Vercel SPA routing configuration
├── public/                 # Static assets (template master slides, icons, logos)
└── src/
    ├── App.jsx             # Main application router, state hydration & global modals
    ├── App.css             # Application global styles & theme tokens
    ├── Navbar.jsx          # Top navigation megamenu, search palette (Ctrl+K) & subnav
    ├── Navbar.css          # Megamenu & modal styling
    ├── MasterDesigner.jsx  # Visual master layout designer canvas
    ├── PptxEditor.jsx      # XML/Tag PowerPoint element editor
    ├── ImageExtractor.jsx  # High-res PPTX image extraction component
    ├── CollageMaker.jsx    # Photo grid collage layout builder
    ├── PdfToPptx.jsx       # PDF to PowerPoint slide converter
    ├── PdfMerger.jsx       # PDF merger component
    ├── PptxMerger.jsx      # PPTX deck merger component
    ├── PptxToPdf.jsx       # PPTX to PDF converter
    ├── PptxToPdfOcr.jsx    # PPTX to PDF conversion with Tesseract OCR scanning
    ├── components/
    │   ├── SlideCanvas.jsx # Live preview canvas for template slides
    │   ├── PairCard.jsx    # Dual-slot (Before/After) image uploader card
    │   └── DropSlot.jsx    # Interactive drop zone component
    ├── config/
    │   ├── routes.js       # Route paths definition
    │   └── templates.js    # Built-in report template definitions
    ├── report/
    │   ├── generateReport.js  # PptxGenJS presentation builder engine
    │   ├── importPptx.js      # JSZip OpenXML PPTX importer & parser
    │   └── pptxEditorUtils.js # Helper functions for reading/updating PPTX XML
    └── utils/
        ├── pairUtils.js    # Slide pair normalization & state helpers
        └── storage.js      # IndexedDB database wrapper & local storage sync
```

---

## 🔑 Keyboard Shortcuts & Navigation

| Shortcut | Action |
|---|---|
| `Ctrl + K` / `Cmd + K` | Open Quick Launcher Search Palette |
| `↑` / `↓` | Navigate matching tools in search palette |
| `Enter` | Select & jump to active tool |
| `Esc` | Close search palette or active dropdown |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
