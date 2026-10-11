import { Module } from '@nestjs/common';
import { AddressService } from './address.service';
import { AddressController } from './address.controller';
import { GooglePlacesModule } from '@Providers/google-places/google-places.module';

@Module({
  imports: [GooglePlacesModule],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
