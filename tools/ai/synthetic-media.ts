import { deflateSync } from "node:zlib"

// Locally generated fixtures only: no user file, CRM data, or remote URL.
export function syntheticPng(): Buffer {
  const chunk = (name: string, bytes: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), bytes])
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    const size = Buffer.alloc(4)
    size.writeUInt32BE(bytes.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([size, data, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(128, 0)
  header.writeUInt32BE(128, 4)
  header[8] = 8
  header[9] = 2 // RGB, no alpha
  const pixels = Buffer.alloc(128 * (1 + 128 * 3))
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const offset = y * 385 + 1 + x * 3
      const red = x >= 32 && x < 96 && y >= 32 && y < 96
      pixels[offset] = 255
      pixels[offset + 1] = red ? 0 : 255
      pixels[offset + 2] = red ? 0 : 255
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ])
}

export function syntheticPdf(): Buffer {
  const stream = "BT /F1 24 Tf 40 200 Td (SYNTHETIC TEST 12345) Tj ET\n"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ]
  let content = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content))
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(content)
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(content)
}
