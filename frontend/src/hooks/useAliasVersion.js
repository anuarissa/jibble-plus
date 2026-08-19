// Se re-renderiza cuando cambian los alias de nombres (jibble_alias_nombres_v1).
// Los alias deciden a qué empleado pertenece cada nombre del aparato — y si hay
// que crear una persona nueva ('CREAR') — así que varias pantallas necesitan
// recalcular al tocarlos.

import { useSyncExternalStore } from 'react'
import { subscribeAlias, getAliasVersion } from '../utils/carpeta-horarios'

export function useAliasVersion() {
  return useSyncExternalStore(subscribeAlias, getAliasVersion, () => 0)
}
