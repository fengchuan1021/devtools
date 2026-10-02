export interface MenuItem {
  name: string
  label: string
  icon: string
}

export const menuItems: MenuItem[] = [
  { name: 'dev', label: '调试', icon: 'pi pi-code' },
  { name: 'screen', label: '画面', icon: 'pi pi-mobile' },
]
