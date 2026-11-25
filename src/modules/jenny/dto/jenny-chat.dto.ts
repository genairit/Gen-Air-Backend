import {
  IsIn,
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  IsNotEmpty,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

import {
  JENNY_LIMITS,
  type JennyContextType,
  type JennyChatRoleType,
  JENNY_CHAT_ROLE_VALUES,
  JENNY_CONTEXT_TYPE_VALUES,
} from '../constants/jenny.constant';

import { Type } from 'class-transformer';
import { Trim } from '@Decorators/trim.decorator';
import { EndsWithUserMessage } from '../decorators/ends-with-user-message.decorator';

export class JennyContextDto {
  @IsNotEmpty()
  @IsIn(JENNY_CONTEXT_TYPE_VALUES)
  declare type: JennyContextType;

  @IsNotEmpty()
  @IsUUID()
  declare id: string;
}

export class JennyMessageDto {
  @IsNotEmpty()
  @IsIn(JENNY_CHAT_ROLE_VALUES)
  declare role: JennyChatRoleType;

  @IsNotEmpty()
  @IsString()
  @Trim()
  @MaxLength(JENNY_LIMITS.MAX_MESSAGE_LENGTH)
  declare content: string;
}

export class JennyChatDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => JennyContextDto)
  declare context: JennyContextDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(JENNY_LIMITS.MAX_MESSAGES)
  @EndsWithUserMessage()
  @ValidateNested({ each: true })
  @Type(() => JennyMessageDto)
  declare messages: JennyMessageDto[];
}
