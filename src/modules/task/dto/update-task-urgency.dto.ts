import { IsNotEmpty, IsBoolean } from 'class-validator';

export class UpdateTaskUrgencyDto {
  @IsNotEmpty() @IsBoolean() declare isUrgent: boolean;
}
