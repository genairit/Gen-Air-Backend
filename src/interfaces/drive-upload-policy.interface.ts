export interface IDriveUploadType {
  mimeType: string;
  contentType?: string;
  signatures: number[][];
  requiredEntry?: string;
  kind: 'binary' | 'text' | 'dxf' | 'zip' | 'office';
}
type DriveUploadTypes = Record<string, IDriveUploadType>;

export interface IDriveUploadPolicy {
  maxFiles: number;
  types: DriveUploadTypes;
  maxFileSizeBytes: number;
  maxTextSizeBytes: number;
  blockedNamePattern: string;
  maxArchiveSizeBytes: number;
}
