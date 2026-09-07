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
      title: 'Members',
      items: [
        { label: 'Active', selected: options.status === 'active', onPress: () => options.onStatus('active') },
        { label: 'Inactive', selected: options.status === 'inactive', onPress: () => options.onStatus('inactive') },
        { label: 'Visitors', selected: options.status === 'visitor', onPress: () => options.onStatus('visitor') },
        { label: 'All', selected: options.status === 'all', onPress: () => options.onStatus('all') },
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
