import { ValidationPipe } from '@nestjs/common';
import { CreateProjectDto } from './create-project.dto';

const projectInput = {
  name: 'פרויקט לבדיקה',
  projectTypeId: '11111111-1111-4111-8111-111111111111',
  customerId: '22222222-2222-4222-8222-222222222222',
  members: [],
  addressPlaceId: 'verified-place',
};
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('new project customer-contact boundary', () => {
  it('keeps linked customer and site inputs without inline contacts', async () => {
    const result: unknown = await pipe.transform(projectInput, {
      type: 'body',
      metatype: CreateProjectDto,
    });
    expect(result).toMatchObject(projectInput);
    expect(result).not.toHaveProperty('contactName');
  });
  it('rejects project-owned payment terms', async () => {
    await expect(
      pipe.transform(
        { ...projectInput, paymentTerms: 'prepaid' },
        { type: 'body', metatype: CreateProjectDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
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
