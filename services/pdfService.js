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
      throw err; // 🔥 important (propagates to route)
    }
  }

  if (jobType === "split") {
    try {
      const { file, startPage, endPage } = data;

      if (!file) throw new Error("No file provided");

      const fileBytes = fs.readFileSync(file);
      const pdf = await PDFDocument.load(fileBytes);

      const totalPages = pdf.getPageCount();

      // 🔥 Validation
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

      // cleanup upload
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

      // 🔥 LIMIT: max 20 images/pages
      if (files.length > 20) {
        throw new Error("Maximum 20 images allowed");
      }

      const pdfDoc = await PDFDocument.create();

      for (const filePath of files) {
        const imageBytes = fs.readFileSync(filePath);

        let image;
        if (filePath.endsWith(".png")) {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          image = await pdfDoc.embedJpg(imageBytes);
        }

        const { width, height } = image.scale(1);

        const page = pdfDoc.addPage([width, height]);

        page.drawImage(image, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      const pdfBytes = await pdfDoc.save();

      const outputName = `images-${Date.now()}.pdf`;
      const outputPath = path.join(__dirname, "../outputs", outputName);

      fs.writeFileSync(outputPath, pdfBytes);

      console.log("✅ Image PDF saved at:", outputPath);

      // cleanup uploads
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
    const { file, pages } = data; // [1,3,5]

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

  throw new Error(`Invalid job type specified: ${jobType}`);
};

