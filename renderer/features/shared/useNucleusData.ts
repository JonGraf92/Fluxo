import React from 'react';
import type { CategoryDto, MemberDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { api } from '../../services/api';

export function useNucleusData(nucleusId: string, refreshToken = 0) {
  const [resources, setResources] = React.useState<ResourceDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [members, setMembers] = React.useState<MemberDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const [res, cats, people] = await Promise.all([api().resources.list(nucleusId), api().categories.list(nucleusId), api().members.list(nucleusId)]);
    setResources(res);
    setCategories(cats);
    setMembers(people);
    setLoading(false);
  }, [nucleusId]);

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleusId, refreshToken]);

  return { resources, categories, members, loading, reload };
}
