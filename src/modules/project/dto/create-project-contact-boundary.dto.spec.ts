import { ValidationPipe } from '@nestjs/common';
import { CreateProjectDto } from './create-project.dto';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';

const projectInput = {
  name: 'פרויקט לבדיקה',
  projectTypeId: '11111111-1111-4111-8111-111111111111',
  customerId: '22222222-2222-4222-8222-222222222222',
  members: [],
  addressPlaceId: 'verified-place',
  paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
};
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('new project customer-contact boundary', () => {
  it('keeps linked customer and site/payment inputs without inline contacts', async () => {
    const result: unknown = await pipe.transform(projectInput, {
      type: 'body',
      metatype: CreateProjectDto,
    });
    expect(result).toMatchObject(projectInput);
    expect(result).not.toHaveProperty('contactName');
  });
  it.each(['contactName', 'contactPhone', 'contactRole'])(
    'rejects removed duplicate%s input',
    async (field) => {
      await expect(
        pipe.transform(
          { ...projectInput, [field]: 'legacy' },
          { type: 'body', metatype: CreateProjectDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
