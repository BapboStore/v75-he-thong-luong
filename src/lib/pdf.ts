/**
 * V75 — Helper xuất phiếu lương ra PDF (Module 5, phiên 10).
 *
 * Cách tiếp cận: dùng `html2canvas` chụp ảnh DOM phiếu lương (vốn render
 * bằng React + Tailwind nên hỗ trợ tiếng Việt tốt) → nhúng ảnh vào jsPDF
 * khổ A5 dọc. Cách này tránh hoàn toàn vấn đề font Unicode tiếng Việt
 * vốn rất nhức đầu khi vẽ text trực tiếp bằng jsPDF (font Helvetica
 * mặc định KHÔNG hỗ trợ dấu nguyên âm Việt).
 *
 * Trade-off:
 *  - Pro: WYSIWYG so với màn hình + tiếng Việt chuẩn xác.
 *  - Con: PDF dạng raster image, text không select được, file ~150-300KB.
 *
 * Với 8 user nội bộ + nhu cầu chính là in giấy / lưu trữ, đánh đổi này
 * chấp nhận được.
 */
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// =============================================================
// Helpers chung
// =============================================================

function safeFileName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'phieu_luong'
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  )
}

// =============================================================
// EXPORT PHIẾU LƯƠNG → PDF (A5 dọc, 1 phiếu/NV theo RULE-08)
// =============================================================

export interface ExportPayslipPdfOptions {
  /** DOM element gốc bao toàn bộ thẻ phiếu lương cần xuất. */
  element: HTMLElement
  /** CCCD nhân viên — dùng đặt tên file. */
  cccd: string
  /** Tháng dạng 'YYYY-MM'. */
  monthYear: string
  /** Họ tên nhân viên — chỉ dùng cho metadata PDF (Title). */
  hoTen?: string
}

/**
 * Xuất phiếu lương 1 NV ra PDF khổ A5 dọc.
 *
 * Quy trình:
 *  1. html2canvas: chụp ảnh `element` ở scale 2 cho net hơn.
 *  2. Tạo jsPDF A5 portrait (148 × 210mm).
 *  3. Tính tỷ lệ ảnh sao cho fit margin 8mm. Nếu ảnh dài hơn 1 trang
 *     thì cắt ảnh thành nhiều slice (mỗi slice vừa 1 trang).
 */
export async function exportPayslipToPdf({
  element,
  cccd,
  monthYear,
  hoTen,
}: ExportPayslipPdfOptions): Promise<void> {
  // 1) Capture DOM → canvas
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    // Tránh capture các overlay/modal ngoài element
    logging: false,
  })

  // 2) Setup PDF A5 portrait
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a5',
    orientation: 'portrait',
  })

  // Metadata (hiển thị trong "File → Properties" của trình đọc PDF)
  pdf.setProperties({
    title: `Phieu luong ${cccd} ${monthYear}`,
    subject: hoTen ? `Phieu luong cua ${hoTen}` : 'Phieu luong V75',
    author: 'V75 - He thong luong',
    creator: 'V75 frontend',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()   // 148mm
  const pageHeight = pdf.internal.pageSize.getHeight() // 210mm
  const margin = 8 // mm — chừa lề 4 mặt

  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2

  // Tỷ lệ canvas → mm. Lấy theo chiều rộng cho fit content area.
  const ratio = contentWidth / canvas.width
  const imgWidthMm = contentWidth
  const fullImgHeightMm = canvas.height * ratio

  // Trường hợp ảnh vừa 1 trang → vẽ 1 lần, xong.
  if (fullImgHeightMm <= contentHeight) {
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidthMm, fullImgHeightMm)
  } else {
    // Ảnh dài hơn 1 trang → cắt theo pixel-row tương ứng contentHeight mỗi trang.
    // Cách dễ nhất: render từng slice của canvas bằng canvas tạm rồi addImage.
    const pixelPerMm = canvas.width / contentWidth // pixel canvas / mm trên PDF
    const slicePxHeight = Math.floor(contentHeight * pixelPerMm)
    let yPx = 0
    let pageIdx = 0

    while (yPx < canvas.height) {
      if (pageIdx > 0) pdf.addPage()

      const sliceCanvas = document.createElement('canvas')
      const thisSliceHeight = Math.min(slicePxHeight, canvas.height - yPx)
      sliceCanvas.width = canvas.width
      sliceCanvas.height = thisSliceHeight
      const ctx = sliceCanvas.getContext('2d')
      if (!ctx) throw new Error('Không tạo được 2D context để cắt PDF.')
      // Vẽ phần ảnh gốc tương ứng (sourceY = yPx) lên canvas tạm
      ctx.drawImage(
        canvas,
        0, yPx, canvas.width, thisSliceHeight,
        0, 0,  canvas.width, thisSliceHeight,
      )

      const sliceImg = sliceCanvas.toDataURL('image/png')
      const sliceHeightMm = thisSliceHeight * ratio
      pdf.addImage(sliceImg, 'PNG', margin, margin, imgWidthMm, sliceHeightMm)

      yPx += thisSliceHeight
      pageIdx++
    }
  }

  const fileName = `PhieuLuong_${safeFileName(cccd)}_${monthYear}_${nowStamp()}.pdf`
  pdf.save(fileName)
}
