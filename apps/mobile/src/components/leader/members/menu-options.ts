import type { MembersOptions } from './types';

export function memberMenuSections(options: MembersOptions) {
  return [
    {
      title: 'View',
      items: [
        { label: 'Grid', selected: options.view === 'grid', onPress: () => options.onView('grid') },
        { label: 'List', selected: options.view === 'list', onPress: () => options.onView('list') },
      ],
    },
    {
      title: 'Sort',
      items: [
        { label: 'Saved order', selected: options.sort === 'saved', onPress: () => options.onSort('saved') },
        { label: 'Name A–Z', selected: options.sort === 'name', onPress: () => options.onSort('name') },
      ],
    },
  ];
}
