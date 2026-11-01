import {
  createPayload,
  validateValues,
  validateReceipt,
  validatePending,
  validateDefinition,
} from './submission.js';

import {
  FIELD_TYPES,
  QUESTIONNAIRE_LIMITS,
} from './constants/questionnaire.js';

import { TIME_LIMITS } from './constants/time.js';
import { STORAGE_KEYS } from './constants/storage.js';

const form = document.getElementById('survey');
const fields = Array.from(form.querySelectorAll('input,textarea'));
const status = document.getElementById('status');
const send = document.getElementById('send');
const availability = document.getElementById('availability');
const state = {
  definition: null,
  pending: null,
  busy: false,
  complete: false,
  dirty: false,
};
const values = () =>
  Object.fromEntries(fields.map((field) => [field.name, field.value]));
const announce = (message) => {
  status.textContent = message;
};
const lockFields = (locked) =>
  fields.forEach((field) => {
    field.disabled = locked;
  });
const setSend = (disabled, label) => {
  send.disabled = disabled;
  send.textContent = label;
};

const readStored = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    announce(
      'שמירת הדפדפן אינה זמינה או שהטיוטה פגומה. אפשר לייצא קובץ לגיבוי.',
    );
    return null;
  }
};
const writeStored = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    announce(
      'לא ניתן לשמור בדפדפן. אל תסגרו את העמוד עד שתקבלו אישור שליחה; מומלץ לייצא קובץ.',
    );
    return false;
  }
};
const removeStored = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    announce('לא ניתן למחוק נתונים מהדפדפן. אפשר למחוק אותם דרך הגדרות האתר.');
  }
};
const fill = (saved) =>
  fields.forEach((field) => {
    if (typeof saved?.[field.name] === 'string') {
      field.value = saved[field.name];
    }
  });
const progress = () => {
  const count = fields.filter(
    (field) => field.tagName === 'TEXTAREA' && field.value.trim(),
  ).length;
  document.getElementById('bar').style.width = `${(count / 7) * 100}%`;
  document.getElementById('count').textContent = `${count} מתוך 7 שאלות נענו`;
  document
    .querySelector('[role=progressbar]')
    .setAttribute('aria-valuenow', count);
};
const snapshot = () => ({ definition: state.definition, values: values() });

const applyDefinition = (definition) => {
  definition.definition.forEach((question) => {
    const field = fields.find((candidate) => candidate.name === question.key);
    if (!field) {
      throw new Error('Unsupported question key');
    }

    field.required = question.required;
    field.maxLength = question.maxLength;
    const label = document.querySelector(`label[for="${field.id}"]`);
    const textNode = Array.from(label.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (textNode) {
      textNode.textContent = question.label;
    }

    const hint = document.getElementById(
      field.getAttribute('aria-describedby'),
    );
    if (hint) {
      hint.textContent = question.helpText ?? '';
    }
  });
  // The introduction to terminology is supplied by this exact version's help text.
  document.querySelector('#q7 .note')?.remove();
  state.definition = definition;
  document.querySelector('.badge').textContent =
    `שאלון תהליכי עבודה · גרסה ${definition.version}`;
};

const restore = (definition) => {
  const pending = readStored(STORAGE_KEYS.PENDING);
  if (validatePending(pending)) {
    const savedValues = {
      fullName: pending.payload.fullName,
      role: pending.payload.role,
      department: pending.payload.department,
      ...Object.fromEntries(
        pending.payload.answers.map((answer) => [
          answer.questionKey,
          answer.value,
        ]),
      ),
    };
    applyDefinition(pending.definition);
    state.pending = pending.payload;
    fill(savedValues);
    lockFields(true);
    availability.textContent =
      'נמצא ניסיון שליחה ללא אישור קבלה. אפשר לנסות שוב את אותו מענה, ללא יצירת כפילות. העריכה נעולה עד לבירור התוצאה.';
    setSend(false, 'בדיקת השליחה / ניסיון חוזר');
    progress();
    return;
  }
  applyDefinition(definition);
  const draft = readStored(STORAGE_KEYS.DRAFT);
  if (draft?.definition?.id === definition.id && draft?.values) {
    fill(draft.values);
    announce('נטענה טיוטה מקומית לגרסה זו. היא עדיין לא נשלחה.');
  }
  if (draft?.definition?.id && draft.definition.id !== definition.id) {
    announce(
      'יש טיוטה מקומית לגרסה קודמת. היא לא הועתקה לשאלות החדשות. ניתן להוריד אותה בכפתור ייצוא הנתונים לפני מילוי מחדש.',
    );
  }
  availability.textContent =
    'הטופס זמין לשליחה. הפרטים האישיים ושאלה אחת לפחות נדרשים; אפשר להשאיר שאלות אחרות ריקות.';
  setSend(false, 'שליחת התשובות');
  progress();
};

const load = async () => {
  try {
    const response = await fetch('/questionnaire/genair-workflow', {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIME_LIMITS.API_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error('Unavailable questionnaire');
    }

    const definition = await response.json();
    if (!validateDefinition(definition)) {
      throw new Error('Invalid questionnaire');
    }
    restore(definition);
  } catch {
    const pending = readStored(STORAGE_KEYS.PENDING);
    if (validateDefinition(pending?.definition)) {
      restore(pending.definition);
      return;
    }
    const draft = readStored(STORAGE_KEYS.DRAFT);
    if (validateDefinition(draft?.definition) && draft?.values) {
      applyDefinition(draft.definition);
      fill(draft.values);
      progress();
    }

    availability.textContent =
      'השאלון אינו זמין כרגע לשליחה. התשובות שבטופס נשמרות בעמוד וניתן לייצא אותן. נסו לרענן מאוחר יותר.';
    setSend(true, 'שליחה אינה זמינה');
  }
};

const submit = async (event) => {
  event.preventDefault();
  if (state.busy || state.complete || !state.definition) {
    return;
  }

  const current = values();
  const hasAnswer = state.definition.definition.some(
    (field) =>
      field.type === FIELD_TYPES.LONG_TEXT && current[field.key]?.trim(),
  );
  if (
    !state.pending &&
    (!validateValues(state.definition, current) || !hasAnswer)
  ) {
    announce(
      'מלאו שם, תפקיד ומחלקה, ולפחות תשובה אחת. בדקו שלא עברתם את מגבלת התווים.',
    );
    form.reportValidity();
    return;
  }
  state.pending ??= createPayload(
    state.definition,
    current,
    crypto.randomUUID(),
  );
  if (
    new TextEncoder().encode(JSON.stringify(state.pending)).length >
    QUESTIONNAIRE_LIMITS.BODY_BYTES
  ) {
    state.pending = null;
    announce(
      'המענה גדול מדי לשליחה. קצרו מעט את הטקסט או שמרו עותק באמצעות ייצוא.',
    );
    return;
  }

  const persisted = writeStored(STORAGE_KEYS.PENDING, {
    definition: state.definition,
    payload: state.pending,
  });
  state.busy = true;
  state.dirty = true;
  lockFields(true);
  setSend(true, 'שולח…');
  announce(
    persisted
      ? 'שולח את התשובות; ממתין לאישור מהשרת…'
      : 'שולח… אין גיבוי בדפדפן, לכן אל תסגרו את העמוד עד לקבלת אישור.',
  );
  try {
    const response = await fetch('/questionnaire-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.pending),
      signal: AbortSignal.timeout(TIME_LIMITS.SUBMISSION_TIMEOUT_MS),
    });
    if (response.status === 400 || response.status === 422) {
      state.pending = null;
      removeStored(STORAGE_KEYS.PENDING);
      lockFields(false);
      setSend(false, 'שליחת התשובות');
      announce(
        'השרת דחה את המענה בגלל נתונים לא תקינים. בדקו את השדות ואורך התשובות ונסו שוב.',
      );
      return;
    }

    if (!response.ok) {
      throw new Error(`Submission failed (${response.status})`);
    }
    const receipt = await response.json();
    if (!validateReceipt(receipt)) {
      throw new Error('Unconfirmed receipt');
    }

    state.complete = true;
    state.dirty = false;
    removeStored(STORAGE_KEYS.PENDING);
    removeStored(STORAGE_KEYS.DRAFT);
    setSend(true, 'התשובות התקבלו');
    availability.textContent = 'תודה! התשובות התקבלו ונשמרו במערכת GenAir.';
    announce(
      `אישור קבלה: ${receipt.id}. ניתן לשמור עותק של התשובות באמצעות הייצוא.`,
    );
  } catch {
    setSend(false, 'בדיקת השליחה / ניסיון חוזר');
    announce(
      'לא התקבל אישור קבלה. ייתכן שהשליחה הצליחה; נסו שוב כאן עם אותו מזהה כדי למנוע כפילות. התשובות נשמרו בעמוד והעריכה נעולה. אפשר לייצא עותק.',
    );
  } finally {
    state.busy = false;
  }
};

const download = (type) => {
  const oldDraft = readStored(STORAGE_KEYS.DRAFT);
  const oldVersion =
    oldDraft?.definition?.id && oldDraft.definition.id !== state.definition?.id;
  const data = oldVersion && type === 'json' ? oldDraft : snapshot();
  const content =
    type === 'json'
      ? JSON.stringify(data, null, 2)
      : Object.entries(data.values)
          .map(([key, value]) => {
            const label =
              data.definition?.definition.find((field) => field.key === key)
                ?.label ??
              document.querySelector(`label[for="${key}"]`)?.textContent ??
              key;
            return `${label}\n${value}`;
          })
          .join('\n\n');
  const blob = new Blob([type === 'txt' ? '\uFEFF' : '', content], {
    type:
      type === 'txt'
        ? 'text/plain;charset=utf-8'
        : 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `GenAir-questionnaire-responses.${type}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), TIME_LIMITS.DOWNLOAD_CLEANUP_MS);
  announce(
    oldVersion && type === 'json'
      ? 'הטיוטה מהגרסה הקודמת הוכנה להורדה.'
      : 'העותק הוכן להורדה. הייצוא עצמו אינו שולח דבר.',
  );
};

form.addEventListener('submit', submit);
form.addEventListener('input', () => {
  state.dirty = true;
  progress();
});
document.getElementById('save').onclick = () => {
  if (state.pending || state.complete) {
    announce(
      'אין צורך לשמור טיוטה בזמן שליחה או לאחר אישור קבלה. ניתן לייצא עותק.',
    );
    return;
  }
  if (writeStored(STORAGE_KEYS.DRAFT, snapshot())) {
    state.dirty = false;
    announce('הטיוטה נשמרה במכשיר בלבד. היא לא נשלחה.');
  }
};
document.getElementById('clear').onclick = () => {
  if (state.pending && !state.complete) {
    announce(
      'יש ניסיון שליחה שטרם אושר. השלימו ניסיון חוזר לפני מחיקת העותק שמונע כפילות.',
    );
    return;
  }
  if (confirm('למחוק את הטיוטה המקומית? התשובות המוצגות יישארו בעמוד.')) {
    removeStored(STORAGE_KEYS.DRAFT);
    announce('הטיוטה המקומית נמחקה; תשובות שכבר נשלחו לשרת לא משתנות.');
  }
};
document.getElementById('exportText').onclick = () => download('txt');
document.getElementById('exportJson').onclick = () => download('json');
window.addEventListener('beforeunload', (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
await load();
