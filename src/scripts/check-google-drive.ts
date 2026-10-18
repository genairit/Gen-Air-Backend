import { Meta, TypedLogger } from '../logger/logger.service';
import { GoogleDriveService } from '../providers/google-drive/google-drive.service';

const logger = new TypedLogger<Meta>('DriveConnectionCheck');
const check = async () => {
  try {
    const result = await new GoogleDriveService().checkConnection();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ready ? 0 : 1;
  } catch {
    logger.error({
      error: 'Invalid Drive credential configuration',
      message:
        'Check the service-account JSON configuration; no credential values are logged',
    });
    process.exitCode = 1;
  }
};
void check();
