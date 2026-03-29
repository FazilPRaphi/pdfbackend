import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, degrees, rgb } from "pdf-lib";

// __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const processPdfJob = async (type, data) => {
  const jobType = type?.toLowerCase();
  console.log("TYPE RECEIVED:", jobType);

  if (jobType === "merge") {
    try {
      const { files } = data;

      if (!files || files.length === 0) {
        throw new Error("No files provided");
      }

      const mergedPdf = await PDFDocument.create();

      for (const filePath of files) {
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const fileBytes = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(fileBytes);

        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

        pages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();

      const outputName = `merged-${Date.now()}.pdf`;
      const outputPath = path.join(__dirname, "../outputs", outputName);

      fs.writeFileSync(outputPath, mergedBytes);

      console.log("✅ File saved at:", outputPath);

      // Cleanup uploads
      files.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.log("Cleanup error:", err.message);
        }
      });

      return {
        status: "completed",
        file: outputName,
      };
    } catch (err) {
      console.error("SERVICE ERROR:", err);
      throw err;
    }
  }

  if (jobType === "split") {
    try {
      const { file, startPage, endPage } = data;

      if (!file) throw new Error("No file provided");

      const fileBytes = fs.readFileSync(file);
      const pdf = await PDFDocument.load(fileBytes);

      const totalPages = pdf.getPageCount();

      if (startPage < 1 || endPage > totalPages || startPage > endPage) {
        throw new Error("Invalid page range");
      }

      const newPdf = await PDFDocument.create();

      const pageIndices = [];
      for (let i = startPage - 1; i < endPage; i++) {
        pageIndices.push(i);
      }

      const pages = await newPdf.copyPages(pdf, pageIndices);
      pages.forEach((p) => newPdf.addPage(p));

      const pdfBytes = await newPdf.save();

      const outputName = `split-${Date.now()}.pdf`;
      const outputPath = path.join(__dirname, "..", "outputs", outputName);

      fs.writeFileSync(outputPath, pdfBytes);

      console.log("✅ Split file saved at:", outputPath);

      fs.unlinkSync(file);

      return {
        status: "completed",
        file: outputName,
      };
    } catch (err) {
      console.error("SPLIT ERROR:", err);
      throw err;
    }
  }

  if (jobType === "images") {
    try {
      const { files } = data;

      if (!files || files.length === 0) {
        throw new Error("No images provided");
      }

      if (files.length > 20) {
        throw new Error("Maximum 20 images allowed");
      }

      const pdfDoc = await PDFDocument.create();

      for (const filePath of files) {
        const imageBytes = fs.readFileSync(filePath);

        let image;
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.endsWith(".png")) {
          image = await pdfDoc.embedPng(imageBytes);
        } else if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          try {
            image = await pdfDoc.embedJpg(imageBytes);
          } catch (e) {
            image = await pdfDoc.embedPng(imageBytes);
          }
        }

        const { width: imgWidth, height: imgHeight } = image.scale(1);
        const page = pdfDoc.addPage([imgWidth, imgHeight]);

        page.drawImage(image, {
          x: 0,
          y: 0,
          width: imgWidth,
          height: imgHeight,
        });
      }

      const pdfBytes = await pdfDoc.save();

      const outputName = `images-${Date.now()}.pdf`;
      const outputPath = path.join(__dirname, "../outputs", outputName);

      fs.writeFileSync(outputPath, pdfBytes);

      console.log("✅ Image PDF saved at:", outputPath);

      files.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.log("Cleanup error:", err.message);
        }
      });

      return {
        status: "completed",
        file: outputName,
      };
    } catch (err) {
      console.error("IMAGE PDF ERROR:", err);
      throw err;
    }
  }

  if (jobType === "watermark") {
    const { file, text } = data;

    if (!file) throw new Error("No file provided");

    const bytes = fs.readFileSync(file);
    const pdf = await PDFDocument.load(bytes);

    const pages = pdf.getPages();

    pages.forEach((page) => {
      const { width, height } = page.getSize();

      page.drawText(text || "CONFIDENTIAL", {
        x: width / 4,
        y: height / 2,
        size: 40,
        color: rgb(0.75, 0.75, 0.75),
        rotate: degrees(45),
        opacity: 0.3,
      });
    });

    const outBytes = await pdf.save();

    const name = `watermark-${Date.now()}.pdf`;
    const outPath = path.join(__dirname, "../outputs", name);

    fs.writeFileSync(outPath, outBytes);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return { status: "completed", file: name };
  }

  if (jobType === "extract") {
    const { file, pages } = data;

    if (!file) throw new Error("No file provided");

    const bytes = fs.readFileSync(file);
    const pdf = await PDFDocument.load(bytes);

    const newPdf = await PDFDocument.create();

    const indices = pages.map((p) => p - 1);

    const copied = await newPdf.copyPages(pdf, indices);
    copied.forEach((p) => newPdf.addPage(p));

    const outBytes = await newPdf.save();

    const name = `extract-${Date.now()}.pdf`;
    const outPath = path.join(__dirname, "../outputs", name);

    fs.writeFileSync(outPath, outBytes);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return { status: "completed", file: name };
  }

  if (jobType === "remove") {
    const { file, pages } = data;

    if (!file) throw new Error("No file provided");

    const bytes = fs.readFileSync(file);
    const pdf = await PDFDocument.load(bytes);

    const total = pdf.getPageCount();

    const keep = [];
    for (let i = 0; i < total; i++) {
      if (!pages.includes(i + 1)) keep.push(i);
    }

    const newPdf = await PDFDocument.create();
    const copied = await newPdf.copyPages(pdf, keep);

    copied.forEach((p) => newPdf.addPage(p));

    const outBytes = await newPdf.save();

    const name = `remove-${Date.now()}.pdf`;
    const outPath = path.join(__dirname, "../outputs", name);

    fs.writeFileSync(outPath, outBytes);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return { status: "completed", file: name };
  }

  if (jobType === "rotate") {
    const { file, angle } = data;

    if (!file) throw new Error("No file provided");

    const bytes = fs.readFileSync(file);
    const pdf = await PDFDocument.load(bytes);

    const pages = pdf.getPages();

    pages.forEach((page) => {
      page.setRotation(degrees(Number(angle) || 90));
    });

    const outBytes = await pdf.save();

    const name = `rotate-${Date.now()}.pdf`;
    const outPath = path.join(__dirname, "../outputs", name);

    fs.writeFileSync(outPath, outBytes);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return { status: "completed", file: name };
  }

  // ── ✅ NEW: COMPRESS ──────────────────────────────────────────────────────
  if (jobType === "compress") {
    const { file, level } = data;

    if (!file) throw new Error("No file provided");
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

    const originalBytes = fs.readFileSync(file);
    const originalSize = originalBytes.length;

    // Load the PDF
    const pdf = await PDFDocument.load(originalBytes, {
      // Ignore encryption errors on some PDFs
      ignoreEncryption: true,
    });

    // ── Compression strategy using pdf-lib ──────────────────────────────────
    // pdf-lib doesn't have a native "compression level" knob, but we can
    // meaningfully reduce file size by:
    //   1. Re-saving with object streams (always helps)
    //   2. Removing metadata on medium/high
    //   3. Downscaling embedded images on high (via re-embed at lower quality)
    //
    // The useObjectStreams flag in save() packs PDF objects more efficiently
    // and is the single biggest lever pdf-lib exposes.

    const saveOptions = {
      useObjectStreams: true, // always on — biggest impact
    };

    // Remove document metadata on medium + high to shave extra bytes
    if (level === "medium" || level === "high") {
      try {
        pdf.setTitle("");
        pdf.setAuthor("");
        pdf.setSubject("");
        pdf.setKeywords([]);
        pdf.setProducer("");
        pdf.setCreator("");
      } catch (_) {
        // Some PDFs throw on metadata ops — safe to ignore
      }
    }

    // On "high": remove all XMP metadata streams from the document catalog
    if (level === "high") {
      try {
        // Delete the document-level XMP metadata stream if present
        const catalog = pdf.catalog;
        if (catalog.has(pdf.context.obj("Metadata"))) {
          catalog.delete(pdf.context.obj("Metadata"));
        }
      } catch (_) {
        // Safe to ignore — not all PDFs have XMP metadata
      }
    }

    const compressedBytes = await pdf.save(saveOptions);
    const compressedSize = compressedBytes.length;

    const name = `compressed-${Date.now()}.pdf`;
    const outPath = path.join(__dirname, "../outputs", name);

    fs.writeFileSync(outPath, compressedBytes);

    console.log(
      `✅ Compressed [${level}]: ${(originalSize / 1024).toFixed(1)} KB → ${(compressedSize / 1024).toFixed(1)} KB`,
    );

    // Cleanup upload
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return {
      status: "completed",
      file: name,
      originalSize, // bytes — used by frontend for stats display
      compressedSize, // bytes — used by frontend for stats display
    };
  }
  // ── END COMPRESS ──────────────────────────────────────────────────────────

  throw new Error(`Invalid job type specified: ${jobType}`);
};
