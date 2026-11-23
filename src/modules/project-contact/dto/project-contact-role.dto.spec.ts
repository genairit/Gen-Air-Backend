import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetProjectContactRoleDto } from './set-project-contact-role.dto';
import { CreateApartmentDto } from '@Modules/project/dto/create-apartment.dto';

const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const APARTMENT = {
  customerId: '11111111-1111-4111-8111-111111111111',
  customerFloor: 1,
  customerApartment: '101',
};

describe('project contact role DTO contracts', () => {
  it('accepts a UUID assignment and explicit null clear, but rejects missing or malformed contactId', async () => {
    expect(
      await validate(
        plainToInstance(SetProjectContactRoleDto, { contactId: CONTACT_ID }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SetProjectContactRoleDto, { contactId: null }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(SetProjectContactRoleDto, {})),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(SetProjectContactRoleDto, { contactId: 'invalid' }),
      ),
    ).not.toHaveLength(0);
  });

  it('supports optional apartment contacts and validates nested contact identities', async () => {
    expect(
      await validate(plainToInstance(CreateApartmentDto, APARTMENT)),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateApartmentDto, { ...APARTMENT, contacts: null }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateApartmentDto, {
          ...APARTMENT,
          contacts: [{ contactId: CONTACT_ID, role: 'architect' }],
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateApartmentDto, {
          ...APARTMENT,
          contacts: [{ contactId: null, role: 'architect' }],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateApartmentDto, {
          ...APARTMENT,
          contacts: 'invalid',
        }),
      ),
    ).not.toHaveLength(0);
  });
});
