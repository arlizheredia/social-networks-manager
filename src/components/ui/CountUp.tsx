import { useCountUp } from '@/lib/motion'
import { fmtNum } from '@/lib/util'

/** Número que cuenta hasta su valor al aparecer o cambiar. */
export function CountUp({ value }: { value: number }) {
  return <>{fmtNum(useCountUp(value))}</>
}
