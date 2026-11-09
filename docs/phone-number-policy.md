# Phone number policy

- A number without a country prefix is interpreted as an Israeli local number. International numbers must start with `+` and a country code.
- Backend DTOs, workbook imports and frontend forms validate using `libphonenumber-js`. A valid Israeli local or international number may include spaces, hyphens or parentheses; invalid or ambiguous numbers are rejected. Optional empty fields remain `null`.
- New values are stored trimmed in the form entered. Existing Israeli values are not rewritten by this change. The display shows the stored value; `tel:` links use the parsed E.164 number, preserving the country code.
- Contact and employee columns remain `varchar(20)`, which accommodates accepted input. Client and server both enforce that limit. Import comparison uses parsed E.164 values so equivalent Israeli and international spellings match without changing stored data.
