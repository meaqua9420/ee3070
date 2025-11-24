/**
 * PDF 图片提取模块
 * PDF Image Extraction Module
 */
import { PDFDocument } from 'pdf-lib'
import { readFile as readFileBuffer } from './fileHandler.js'

export interface ExtractedImage {
  imageData: Buffer
  index: number
  pageNumber: number
  width?: number
  height?: number
}

/**
 * 从PDF中提取所有图片
 * Extract all images from a PDF file
 */
export async function extractImagesFromPDF(fileId: string): Promise<ExtractedImage[]> {
  try {
    const pdfBuffer = await readFileBuffer(fileId)
    const pdfDoc = await PDFDocument.load(pdfBuffer)

    const images: ExtractedImage[] = []
    const pageCount = pdfDoc.getPageCount()

    console.log(`[pdfImageExtractor] Processing ${pageCount} pages...`)

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const page = pdfDoc.getPage(pageIndex)

      // 兼容新版 pdf-lib：避免直接呼叫 normalized()
      const rawResources =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (page as any)?.node?.get?.('Resources') ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (page as any)?.node?.dict?.get?.('Resources')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Resources = rawResources && (pdfDoc as any).context?.lookup
        ? // 如果是 Ref，lookup 取得實體
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pdfDoc as any).context.lookup(rawResources)
        : rawResources

      if (!Resources || typeof Resources.get !== 'function') {
        console.log(`[pdfImageExtractor] Page ${pageIndex + 1}: No resources found`)
        continue
      }

      // 获取XObject资源（包含图片）
      const xObjects = Resources.get('XObject')

      if (!xObjects) {
        console.log(`[pdfImageExtractor] Page ${pageIndex + 1}: No XObjects found`)
        continue
      }

      // 遍历所有XObject
      const xObjectKeys = xObjects.keys()
      let imageIndexInPage = 0

      for (const key of xObjectKeys) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawXObject = (xObjects as any).get ? (xObjects as any).get(key) : null
        // 如果是 Ref，lookup 取得實體
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const xObject = rawXObject && (pdfDoc as any).context?.lookup
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (pdfDoc as any).context.lookup(rawXObject)
          : rawXObject

        if (!xObject) continue

        // 检查是否为图片对象
        const subtype = xObject.get('Subtype')
        if (subtype && subtype.toString() === '/Image') {
          try {
            // 提取图片数据
            const imageData = await extractImageData(xObject, pdfDoc)

            if (imageData) {
              const widthVal =
                xObject?.get?.('Width') ??
                xObject?.dict?.get?.('Width')
              const heightVal =
                xObject?.get?.('Height') ??
                xObject?.dict?.get?.('Height')

              images.push({
                imageData,
                index: images.length,
                pageNumber: pageIndex + 1,
                width: widthVal?.numberValue ?? widthVal?.value,
                height: heightVal?.numberValue ?? heightVal?.value,
              })

              console.log(
                `[pdfImageExtractor] ✓ Extracted image ${images.length} from page ${pageIndex + 1} (${imageData.length} bytes)`
              )
              imageIndexInPage++
            }
          } catch (err) {
            console.error(
              `[pdfImageExtractor] Failed to extract image from page ${pageIndex + 1}:`,
              err
            )
          }
        }
      }

      if (imageIndexInPage > 0) {
        console.log(`[pdfImageExtractor] Page ${pageIndex + 1}: Found ${imageIndexInPage} images`)
      }
    }

    console.log(`[pdfImageExtractor] Total images extracted: ${images.length}`)
    return images
  } catch (error) {
    console.error('[pdfImageExtractor] Error extracting images from PDF:', error)
    // 不要讓圖片解析阻斷 PDF 流程，改回傳空陣列並記錄錯誤
    return []
  }
}

/**
 * 从XObject中提取图片数据
 */
async function extractImageData(xObject: any, pdfDoc: PDFDocument): Promise<Buffer | null> {
  try {
    const getVal = (key: string) =>
      xObject?.get?.(key) ??
      xObject?.dict?.get?.(key)

    // 获取图片的压缩流
    const stream =
      xObject?.getStream?.() ??
      (xObject?.getContents ? xObject.getContents() : null) ??
      xObject?.contents ??
      xObject?.get?.('Contents')

    if (!stream) {
      return null
    }

    // 尝试直接获取原始数据
    const imageBytes = stream

    if (!imageBytes || imageBytes.length === 0) {
      return null
    }

    // 检查图片格式
    const colorSpace = getVal('ColorSpace')
    const filter = getVal('Filter')

    // 如果是JPEG格式,直接返回
    if (filter && filter.toString().includes('DCTDecode')) {
      return Buffer.from(imageBytes)
    }

    // 其他格式需要解码（简化处理，直接返回原始数据）
    return Buffer.from(imageBytes)
  } catch (error) {
    console.error('[pdfImageExtractor] Error extracting image data:', error)
    return null
  }
}

/**
 * 将提取的图片转换为Base64
 */
export function imageToBase64(imageBuffer: Buffer): string {
  return imageBuffer.toString('base64')
}

/**
 * 检测PDF是否包含图片
 */
export async function pdfContainsImages(fileId: string): Promise<boolean> {
  try {
    const images = await extractImagesFromPDF(fileId)
    return images.length > 0
  } catch (error) {
    console.error('[pdfImageExtractor] Error checking for images:', error)
    return false
  }
}
