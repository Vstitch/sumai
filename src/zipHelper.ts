function crc32(str: string): number {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ -1;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

export function createStoreZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  
  interface FileRecord {
    name: string;
    nameBytes: Uint8Array;
    contentBytes: Uint8Array;
    crc: number;
    offset: number;
  }
  
  const records: FileRecord[] = [];
  let currentOffset = 0;
  
  // 1. Write Local File Headers & File Data
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(file.content);
    const offset = currentOffset;
    
    records.push({
      name: file.name,
      nameBytes,
      contentBytes,
      crc,
      offset
    });
    
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    
    // Local file header signature: 0x04034b50
    view.setUint32(0, 0x04034b50, true);
    // Version needed to extract: 10 (1.0)
    view.setUint16(4, 10, true);
    // General purpose bit flag: 0
    view.setUint16(6, 0, true);
    // Compression method: 0 (Stored)
    view.setUint16(8, 0, true);
    // Last mod file time & date: 0
    view.setUint32(10, 0, true);
    // CRC-32
    view.setUint32(14, crc, true);
    // Compressed size
    view.setUint32(18, contentBytes.length, true);
    // Uncompressed size
    view.setUint32(22, contentBytes.length, true);
    // File name length
    view.setUint16(26, nameBytes.length, true);
    // Extra field length: 0
    view.setUint16(28, 0, true);
    
    // File name bytes
    localHeader.set(nameBytes, 30);
    
    parts.push(localHeader);
    parts.push(contentBytes);
    
    currentOffset += localHeader.length + contentBytes.length;
  }
  
  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  
  // 2. Write Central Directory Headers
  for (const record of records) {
    const cdHeader = new Uint8Array(46 + record.nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    
    // Central directory file header signature: 0x02014b50
    view.setUint32(0, 0x02014b50, true);
    // Version made by: 20 (2.0)
    view.setUint16(4, 20, true);
    // Version needed to extract: 10 (1.0)
    view.setUint16(6, 10, true);
    // General purpose bit flag: 0
    view.setUint16(8, 0, true);
    // Compression method: 0 (Stored)
    view.setUint16(10, 0, true);
    // Last mod file time & date: 0
    view.setUint32(12, 0, true);
    // CRC-32
    view.setUint32(16, record.crc, true);
    // Compressed size
    view.setUint32(20, record.contentBytes.length, true);
    // Uncompressed size
    view.setUint32(24, record.contentBytes.length, true);
    // File name length
    view.setUint16(28, record.nameBytes.length, true);
    // Extra field length: 0
    view.setUint16(30, 0, true);
    // File comment length: 0
    view.setUint16(32, 0, true);
    // Disk number start: 0
    view.setUint16(34, 0, true);
    // Internal file attributes: 0
    view.setUint16(36, 0, true);
    // External file attributes: 0
    view.setUint32(38, 0, true);
    // Local header offset
    view.setUint32(42, record.offset, true);
    
    // File name bytes
    cdHeader.set(record.nameBytes, 46);
    
    parts.push(cdHeader);
    centralDirectorySize += cdHeader.length;
  }
  
  // 3. Write End of Central Directory Record (EOCD)
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  
  // End of central directory signature: 0x06054b50
  view.setUint32(0, 0x06054b50, true);
  // Number of this disk: 0
  view.setUint16(4, 0, true);
  // Disk where central directory starts: 0
  view.setUint16(6, 0, true);
  // Number of central directory records on this disk
  view.setUint16(8, files.length, true);
  // Total number of central directory records
  view.setUint16(10, files.length, true);
  // Size of central directory
  view.setUint32(12, centralDirectorySize, true);
  // Offset of start of central directory, relative to start of archive
  view.setUint32(16, centralDirectoryOffset, true);
  // Comment length: 0
  view.setUint16(20, 0, true);
  
  parts.push(eocd);
  
  return new Blob(parts, { type: 'application/zip' });
}
