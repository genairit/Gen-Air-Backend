import { ILlmToolDefinition } from '@Interfaces/llm.interface';
import { JENNY_LIMITS, JENNY_TOOL_NAMES } from '../../constants/jenny.constant';

const NO_PARAMETERS = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const SEARCH_QUERY_ARGUMENT = {
  name: 'query',
  minLength: JENNY_LIMITS.MIN_SEARCH_QUERY_LENGTH,
  maxLength: JENNY_LIMITS.MAX_SEARCH_QUERY_LENGTH,
} as const;

export const PROJECT_JENNY_TOOL_DEFINITIONS = {
  GET_PROJECT_STATUS: {
    name: JENNY_TOOL_NAMES.GET_PROJECT_STATUS,
    description:
      'Returns the current project status: stage, waiting reason, project type, address, customer, building (for apartments), team members and internal notes.',
    parameters: NO_PARAMETERS,
  },
  GET_QUOTATION: {
    name: JENNY_TOOL_NAMES.GET_QUOTATION,
    description:
      "Returns the project's quotations with number, version, status, date, brand, VAT rate percent and the totals before VAT, VAT amount and total with VAT exactly as calculated by the system.",
    parameters: NO_PARAMETERS,
  },
  LIST_PROJECT_DOCUMENTS: {
    name: JENNY_TOOL_NAMES.LIST_PROJECT_DOCUMENTS,
    description:
      "Lists the files in the project's Google Drive folder (most recently modified first) with name, folder, last modified time and link.",
    parameters: NO_PARAMETERS,
  },
  SEARCH_PROJECT_DOCUMENTS: {
    name: JENNY_TOOL_NAMES.SEARCH_PROJECT_DOCUMENTS,
    description:
      "Full-text searches inside the project's PDF documents and returns matching snippets with file name and page number. Also reports files that could not be searched (scanned without text, too large, unreadable or still pending).",
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [SEARCH_QUERY_ARGUMENT.name],
      properties: {
        [SEARCH_QUERY_ARGUMENT.name]: {
          type: 'string',
          minLength: SEARCH_QUERY_ARGUMENT.minLength,
          maxLength: SEARCH_QUERY_ARGUMENT.maxLength,
          description:
            'Distinctive words to look for, in the language of the documents (usually Hebrew), for example "דגם מעבה" or "לוח חשמל".',
        },
      },
    },
  },
} as const satisfies Record<string, ILlmToolDefinition>;
