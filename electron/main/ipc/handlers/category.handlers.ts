import { CreateCategory } from '../../../../src/application/use-cases/category/CreateCategory';
import { ListCategories } from '../../../../src/application/use-cases/category/ListCategories';
import { CategoryDto, CHANNELS, CreateCategorySchema, ListByNucleusSchema } from '../../../../src/shared/ipc-contract';
import { toCategoryDto } from '../dto';
import { IpcContext, handleAuthenticated } from '../register';

export function registerCategoryHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof CreateCategorySchema, CategoryDto>(
    ctx,
    CHANNELS.categoryCreate,
    CreateCategorySchema,
    async (payload) => {
      const category = await new CreateCategory(ctx.uow).execute(payload);
      return toCategoryDto(category);
    },
  );

  handleAuthenticated<typeof ListByNucleusSchema, CategoryDto[]>(
    ctx,
    CHANNELS.categoryList,
    ListByNucleusSchema,
    async (payload) => {
      const categories = await new ListCategories(ctx.repos).execute(payload.nucleusId);
      return categories.map(toCategoryDto);
    },
  );
}
