export type MotorFicha = {
  brand: string
  model: string
  code: string
  watts: number
  volts: number
  hz: number
  rpm: number
  amps: number
  tempMax: number
  verified: boolean
}

const MOTOR_DB: MotorFicha[] = [
  { brand: 'Fasco', model: 'D1092', code: 'D1092-115', watts: 75, volts: 115, hz: 60, rpm: 1550, amps: 1.6, tempMax: 60, verified: false },
  { brand: 'Fasco', model: 'D1126', code: 'D1126-115', watts: 120, volts: 115, hz: 60, rpm: 1050, amps: 2.1, tempMax: 60, verified: false },
  { brand: 'Fasco', model: 'D727', code: 'D727-230', watts: 190, volts: 230, hz: 60, rpm: 1075, amps: 1.2, tempMax: 60, verified: false },
  { brand: 'US Motors (Nidec)', model: '1861', code: 'K055HXKKB', watts: 250, volts: 115, hz: 60, rpm: 1075, amps: 4.2, tempMax: 55, verified: false },
  { brand: 'US Motors (Nidec)', model: '8905', code: 'K048HXKKB', watts: 370, volts: 230, hz: 60, rpm: 1625, amps: 2.5, tempMax: 55, verified: false },
  { brand: 'Genteq', model: '3733', code: '5KCP39EGS070S', watts: 250, volts: 208, hz: 60, rpm: 1075, amps: 1.9, tempMax: 55, verified: false },
  { brand: 'Genteq', model: '5464', code: '5SME39SL0253', watts: 620, volts: 230, hz: 60, rpm: 1200, amps: 4.1, tempMax: 60, verified: false },
  { brand: 'Century (A.O. Smith)', model: 'FDL1056', code: 'FDL1056A', watts: 370, volts: 115, hz: 60, rpm: 1075, amps: 6.4, tempMax: 50, verified: false },
  { brand: 'Century (A.O. Smith)', model: 'ORT4538', code: 'ORT4538', watts: 250, volts: 208, hz: 60, rpm: 1075, amps: 1.8, tempMax: 55, verified: false },
  { brand: 'Dayton', model: '1AGC4', code: '1AGC4', watts: 190, volts: 115, hz: 60, rpm: 1550, amps: 3.4, tempMax: 40, verified: false },
  { brand: 'Dayton', model: '4M064', code: '4M064', watts: 90, volts: 115, hz: 60, rpm: 1550, amps: 1.5, tempMax: 40, verified: false },
  { brand: 'Broan', model: '97009745', code: '97009745', watts: 55, volts: 120, hz: 60, rpm: 1500, amps: 0.9, tempMax: 40, verified: false },
  { brand: 'Broan', model: '99080517', code: '99080517', watts: 40, volts: 120, hz: 60, rpm: 1350, amps: 0.7, tempMax: 40, verified: false },
  { brand: 'ebm-papst', model: 'M4Q045-CA03-01', code: 'M4Q045', watts: 65, volts: 230, hz: 50, rpm: 2500, amps: 0.3, tempMax: 60, verified: false },
  { brand: 'ebm-papst', model: 'R2E190-AO26-05', code: 'R2E190', watts: 170, volts: 230, hz: 50, rpm: 2600, amps: 0.78, tempMax: 60, verified: false },
  { brand: 'ebm-papst', model: 'A2E250-AE65-01', code: 'A2E250', watts: 165, volts: 230, hz: 50, rpm: 1300, amps: 0.75, tempMax: 60, verified: false },
  { brand: 'Ziehl-Abegg', model: 'FB045-4EK.4I.V4P', code: 'FB045', watts: 210, volts: 230, hz: 50, rpm: 1360, amps: 0.95, tempMax: 60, verified: false },
  { brand: 'Ziehl-Abegg', model: 'RG25P-4EK.4I.1R', code: 'RG25P', watts: 300, volts: 230, hz: 50, rpm: 1420, amps: 1.35, tempMax: 60, verified: false },
  { brand: 'WEG', model: 'W22 IR3 0,25 CV', code: '11538933', watts: 185, volts: 220, hz: 60, rpm: 1720, amps: 1.6, tempMax: 40, verified: false },
  { brand: 'WEG', model: 'W22 IR3 0,5 CV', code: '11538950', watts: 370, volts: 220, hz: 60, rpm: 1725, amps: 2.9, tempMax: 40, verified: false },
  { brand: 'WEG', model: 'W22 IR3 1 CV', code: '11539000', watts: 750, volts: 220, hz: 60, rpm: 1730, amps: 5.2, tempMax: 40, verified: false },
  { brand: 'Siemens', model: '1LA7070-4YA60', code: '1LA7070', watts: 250, volts: 230, hz: 50, rpm: 1370, amps: 1.9, tempMax: 40, verified: false },
  { brand: 'Soler & Palau', model: 'TD-500/150', code: 'TD500-150', watts: 65, volts: 230, hz: 50, rpm: 2400, amps: 0.3, tempMax: 40, verified: false },
  { brand: 'Soler & Palau', model: 'HCFB/4-315', code: 'HCFB4-315', watts: 145, volts: 230, hz: 50, rpm: 1350, amps: 0.68, tempMax: 40, verified: false },
]

function contiene(hay: string, needle: string) {
  const n = needle.trim().toLowerCase()
  if (!n) return false
  return hay.toLowerCase().includes(n)
}

export function buscarFicha(modelo: string): MotorFicha | null {
  const q = modelo.trim()
  if (!q) return null
  return (
    MOTOR_DB.find(
      (m) => contiene(m.model, q) || contiene(q, m.model) || contiene(m.code, q) || contiene(q, m.code),
    ) ?? null
  )
}
