// Multer decodes multipart filenames as latin1, which garbles Hebrew names.
export const decodeUploadedFileName = (originalName: string): string =>
  Buffer.from(originalName, 'latin1').toString('utf8');
