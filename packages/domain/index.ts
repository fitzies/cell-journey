export const postalDistrictCodes = [
  'D01',
  'D02',
  'D03',
  'D04',
  'D05',
  'D06',
  'D07',
  'D08',
  'D09',
  'D10',
  'D11',
  'D12',
  'D13',
  'D14',
  'D15',
  'D16',
  'D17',
  'D18',
  'D19',
  'D20',
  'D21',
  'D22',
  'D23',
  'D24',
  'D25',
  'D26',
  'D27',
  'D28',
] as const;

export type PostalDistrictCode = (typeof postalDistrictCodes)[number];

export type PostalDistrict = {
  code: PostalDistrictCode;
  number: number;
  area: string;
};

export const postalDistricts: Record<PostalDistrictCode, PostalDistrict> = {
  D01: { code: 'D01', number: 1, area: "Raffles Place, Cecil, Marina, People's Park" },
  D02: { code: 'D02', number: 2, area: 'Anson, Tanjong Pagar' },
  D03: { code: 'D03', number: 3, area: 'Queenstown, Tiong Bahru' },
  D04: { code: 'D04', number: 4, area: 'Telok Blangah, HarbourFront' },
  D05: { code: 'D05', number: 5, area: 'Pasir Panjang, Hong Leong Garden, Clementi New Town' },
  D06: { code: 'D06', number: 6, area: 'City Hall, High Street' },
  D07: { code: 'D07', number: 7, area: 'Middle Road, Golden Mile' },
  D08: { code: 'D08', number: 8, area: 'Little India' },
  D09: { code: 'D09', number: 9, area: 'Orchard, Cairnhill, River Valley' },
  D10: { code: 'D10', number: 10, area: 'Ardmore, Bukit Timah, Holland Road, Tanglin' },
  D11: { code: 'D11', number: 11, area: 'Watten Estate, Novena, Thomson' },
  D12: { code: 'D12', number: 12, area: 'Balestier, Toa Payoh, Serangoon' },
  D13: { code: 'D13', number: 13, area: 'MacPherson, Braddell' },
  D14: { code: 'D14', number: 14, area: 'Geylang, Eunos' },
  D15: { code: 'D15', number: 15, area: 'Katong, Joo Chiat, Amber Road' },
  D16: { code: 'D16', number: 16, area: 'Bedok, Upper East Coast, Eastwood, Kew Drive' },
  D17: { code: 'D17', number: 17, area: 'Loyang, Changi' },
  D18: { code: 'D18', number: 18, area: 'Tampines, Pasir Ris' },
  D19: { code: 'D19', number: 19, area: 'Serangoon Garden, Hougang, Punggol' },
  D20: { code: 'D20', number: 20, area: 'Bishan, Ang Mo Kio' },
  D21: { code: 'D21', number: 21, area: 'Upper Bukit Timah, Clementi Park, Ulu Pandan' },
  D22: { code: 'D22', number: 22, area: 'Jurong' },
  D23: { code: 'D23', number: 23, area: 'Hillview, Dairy Farm, Bukit Panjang, Choa Chu Kang' },
  D24: { code: 'D24', number: 24, area: 'Lim Chu Kang, Tengah' },
  D25: { code: 'D25', number: 25, area: 'Kranji, Woodlands' },
  D26: { code: 'D26', number: 26, area: 'Upper Thomson, Springleaf' },
  D27: { code: 'D27', number: 27, area: 'Yishun, Sembawang' },
  D28: { code: 'D28', number: 28, area: 'Seletar' },
};

const postalSectorToDistrict: Record<string, PostalDistrictCode> = {
  '01': 'D01', '02': 'D01', '03': 'D01', '04': 'D01', '05': 'D01', '06': 'D01',
  '07': 'D02', '08': 'D02',
  '09': 'D04', '10': 'D04',
  '11': 'D05', '12': 'D05', '13': 'D05',
  '14': 'D03', '15': 'D03', '16': 'D03',
  '17': 'D06',
  '18': 'D07', '19': 'D07',
  '20': 'D08', '21': 'D08',
  '22': 'D09', '23': 'D09',
  '24': 'D10', '25': 'D10', '26': 'D10', '27': 'D10',
  '28': 'D11', '29': 'D11', '30': 'D11',
  '31': 'D12', '32': 'D12', '33': 'D12',
  '34': 'D13', '35': 'D13', '36': 'D13', '37': 'D13',
  '38': 'D14', '39': 'D14', '40': 'D14', '41': 'D14',
  '42': 'D15', '43': 'D15', '44': 'D15', '45': 'D15',
  '46': 'D16', '47': 'D16', '48': 'D16',
  '49': 'D17', '50': 'D17', '81': 'D17',
  '51': 'D18', '52': 'D18',
  '53': 'D19', '54': 'D19', '55': 'D19', '82': 'D19',
  '56': 'D20', '57': 'D20',
  '58': 'D21', '59': 'D21',
  '60': 'D22', '61': 'D22', '62': 'D22', '63': 'D22', '64': 'D22',
  '65': 'D23', '66': 'D23', '67': 'D23', '68': 'D23',
  '69': 'D24', '70': 'D24', '71': 'D24',
  '72': 'D25', '73': 'D25',
  '75': 'D27', '76': 'D27',
  '77': 'D26', '78': 'D26',
  '79': 'D28', '80': 'D28',
};

export function getPostalDistrictFromSector(value: string): PostalDistrict | null {
  const sector = value.trim();
  if (!/^\d{2}$/.test(sector)) return null;
  const code = postalSectorToDistrict[sector];
  return code ? postalDistricts[code] : null;
}

export function getPostalDistrict(code: PostalDistrictCode | undefined): PostalDistrict | null {
  return code ? postalDistricts[code] : null;
}

export function formatPostalDistrict(code: PostalDistrictCode | undefined): string | null {
  const district = getPostalDistrict(code);
  return district ? `District ${district.number} · ${district.area}` : null;
}
