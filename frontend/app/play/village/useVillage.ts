import { useSyncExternalStore } from 'react'
import { villageStore } from '@/utils/village/client'

export function useVillage() {
    return useSyncExternalStore(villageStore.subscribe, villageStore.get, villageStore.get)
}
