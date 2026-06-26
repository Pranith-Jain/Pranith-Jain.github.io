import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Phone OSINT — enrich a phone number with carrier, location, deep links, and dorks.
 *
 *   GET /api/v1/phone-osint?phone=<number>
 *
 * Accepts E.164 (+15551234567), bare digits (15551234567), or formatted
 * ((555) 123-4567, 555-123-4567). Runs entirely in Workers — no Python.
 *
 * Optional: NUMVERIFY_API_KEY in env enables carrier validation via apilayer.net.
 * Optional: calls /api/v1/hudsonrock/username internally for breach exposure.
 *
 * Cache TTL: 1 hour.
 */

const CACHE_TTL_SECONDS = 60 * 60;

const COUNTRY_CODES: Record<string, { code: string; name: string; nationalPrefix: string }> = {
  '1': { code: 'US', name: 'United States', nationalPrefix: '1' },
  '7': { code: 'RU', name: 'Russia', nationalPrefix: '7' },
  '20': { code: 'EG', name: 'Egypt', nationalPrefix: '20' },
  '27': { code: 'ZA', name: 'South Africa', nationalPrefix: '27' },
  '30': { code: 'GR', name: 'Greece', nationalPrefix: '30' },
  '31': { code: 'NL', name: 'Netherlands', nationalPrefix: '31' },
  '32': { code: 'BE', name: 'Belgium', nationalPrefix: '32' },
  '33': { code: 'FR', name: 'France', nationalPrefix: '33' },
  '34': { code: 'ES', name: 'Spain', nationalPrefix: '34' },
  '36': { code: 'HU', name: 'Hungary', nationalPrefix: '36' },
  '39': { code: 'IT', name: 'Italy', nationalPrefix: '39' },
  '40': { code: 'RO', name: 'Romania', nationalPrefix: '40' },
  '41': { code: 'CH', name: 'Switzerland', nationalPrefix: '41' },
  '43': { code: 'AT', name: 'Austria', nationalPrefix: '43' },
  '44': { code: 'GB', name: 'United Kingdom', nationalPrefix: '44' },
  '45': { code: 'DK', name: 'Denmark', nationalPrefix: '45' },
  '46': { code: 'SE', name: 'Sweden', nationalPrefix: '46' },
  '47': { code: 'NO', name: 'Norway', nationalPrefix: '47' },
  '48': { code: 'PL', name: 'Poland', nationalPrefix: '48' },
  '49': { code: 'DE', name: 'Germany', nationalPrefix: '49' },
  '51': { code: 'PE', name: 'Peru', nationalPrefix: '51' },
  '52': { code: 'MX', name: 'Mexico', nationalPrefix: '52' },
  '53': { code: 'CU', name: 'Cuba', nationalPrefix: '53' },
  '54': { code: 'AR', name: 'Argentina', nationalPrefix: '54' },
  '55': { code: 'BR', name: 'Brazil', nationalPrefix: '55' },
  '56': { code: 'CL', name: 'Chile', nationalPrefix: '56' },
  '57': { code: 'CO', name: 'Colombia', nationalPrefix: '57' },
  '58': { code: 'VE', name: 'Venezuela', nationalPrefix: '58' },
  '60': { code: 'MY', name: 'Malaysia', nationalPrefix: '60' },
  '61': { code: 'AU', name: 'Australia', nationalPrefix: '61' },
  '62': { code: 'ID', name: 'Indonesia', nationalPrefix: '62' },
  '63': { code: 'PH', name: 'Philippines', nationalPrefix: '63' },
  '64': { code: 'NZ', name: 'New Zealand', nationalPrefix: '64' },
  '65': { code: 'SG', name: 'Singapore', nationalPrefix: '65' },
  '66': { code: 'TH', name: 'Thailand', nationalPrefix: '66' },
  '81': { code: 'JP', name: 'Japan', nationalPrefix: '81' },
  '82': { code: 'KR', name: 'South Korea', nationalPrefix: '82' },
  '84': { code: 'VN', name: 'Vietnam', nationalPrefix: '84' },
  '86': { code: 'CN', name: 'China', nationalPrefix: '86' },
  '90': { code: 'TR', name: 'Turkey', nationalPrefix: '90' },
  '91': { code: 'IN', name: 'India', nationalPrefix: '91' },
  '92': { code: 'PK', name: 'Pakistan', nationalPrefix: '92' },
  '93': { code: 'AF', name: 'Afghanistan', nationalPrefix: '93' },
  '94': { code: 'LK', name: 'Sri Lanka', nationalPrefix: '94' },
  '95': { code: 'MM', name: 'Myanmar', nationalPrefix: '95' },
  '212': { code: 'MA', name: 'Morocco', nationalPrefix: '212' },
  '213': { code: 'DZ', name: 'Algeria', nationalPrefix: '213' },
  '216': { code: 'TN', name: 'Tunisia', nationalPrefix: '216' },
  '218': { code: 'LY', name: 'Libya', nationalPrefix: '218' },
  '220': { code: 'GM', name: 'Gambia', nationalPrefix: '220' },
  '221': { code: 'SN', name: 'Senegal', nationalPrefix: '221' },
  '222': { code: 'MR', name: 'Mauritania', nationalPrefix: '222' },
  '223': { code: 'ML', name: 'Mali', nationalPrefix: '223' },
  '224': { code: 'GN', name: 'Guinea', nationalPrefix: '224' },
  '225': { code: 'CI', name: 'Ivory Coast', nationalPrefix: '225' },
  '226': { code: 'BF', name: 'Burkina Faso', nationalPrefix: '226' },
  '227': { code: 'NE', name: 'Niger', nationalPrefix: '227' },
  '228': { code: 'TG', name: 'Togo', nationalPrefix: '228' },
  '229': { code: 'BJ', name: 'Benin', nationalPrefix: '229' },
  '230': { code: 'MU', name: 'Mauritius', nationalPrefix: '230' },
  '231': { code: 'LR', name: 'Liberia', nationalPrefix: '231' },
  '232': { code: 'SL', name: 'Sierra Leone', nationalPrefix: '232' },
  '233': { code: 'GH', name: 'Ghana', nationalPrefix: '233' },
  '234': { code: 'NG', name: 'Nigeria', nationalPrefix: '234' },
  '235': { code: 'TD', name: 'Chad', nationalPrefix: '235' },
  '236': { code: 'CF', name: 'Central African Republic', nationalPrefix: '236' },
  '237': { code: 'CM', name: 'Cameroon', nationalPrefix: '237' },
  '238': { code: 'CV', name: 'Cape Verde', nationalPrefix: '238' },
  '239': { code: 'ST', name: 'Sao Tome and Principe', nationalPrefix: '239' },
  '240': { code: 'GQ', name: 'Equatorial Guinea', nationalPrefix: '240' },
  '241': { code: 'GA', name: 'Gabon', nationalPrefix: '241' },
  '242': { code: 'CG', name: 'Congo', nationalPrefix: '242' },
  '243': { code: 'CD', name: 'DR Congo', nationalPrefix: '243' },
  '244': { code: 'AO', name: 'Angola', nationalPrefix: '244' },
  '245': { code: 'GW', name: 'Guinea-Bissau', nationalPrefix: '245' },
  '246': { code: 'IO', name: 'British Indian Ocean Territory', nationalPrefix: '246' },
  '248': { code: 'SC', name: 'Seychelles', nationalPrefix: '248' },
  '249': { code: 'SD', name: 'Sudan', nationalPrefix: '249' },
  '250': { code: 'RW', name: 'Rwanda', nationalPrefix: '250' },
  '251': { code: 'ET', name: 'Ethiopia', nationalPrefix: '251' },
  '252': { code: 'SO', name: 'Somalia', nationalPrefix: '252' },
  '253': { code: 'DJ', name: 'Djibouti', nationalPrefix: '253' },
  '254': { code: 'KE', name: 'Kenya', nationalPrefix: '254' },
  '255': { code: 'TZ', name: 'Tanzania', nationalPrefix: '255' },
  '256': { code: 'UG', name: 'Uganda', nationalPrefix: '256' },
  '257': { code: 'BI', name: 'Burundi', nationalPrefix: '257' },
  '258': { code: 'MZ', name: 'Mozambique', nationalPrefix: '258' },
  '260': { code: 'ZM', name: 'Zambia', nationalPrefix: '260' },
  '261': { code: 'MG', name: 'Madagascar', nationalPrefix: '261' },
  '262': { code: 'RE', name: 'Reunion', nationalPrefix: '262' },
  '263': { code: 'ZW', name: 'Zimbabwe', nationalPrefix: '263' },
  '264': { code: 'NA', name: 'Namibia', nationalPrefix: '264' },
  '265': { code: 'MW', name: 'Malawi', nationalPrefix: '265' },
  '266': { code: 'LS', name: 'Lesotho', nationalPrefix: '266' },
  '267': { code: 'BW', name: 'Botswana', nationalPrefix: '267' },
  '268': { code: 'SZ', name: 'Eswatini', nationalPrefix: '268' },
  '269': { code: 'KM', name: 'Comoros', nationalPrefix: '269' },
  '290': { code: 'SH', name: 'Saint Helena', nationalPrefix: '290' },
  '291': { code: 'ER', name: 'Eritrea', nationalPrefix: '291' },
  '297': { code: 'AW', name: 'Aruba', nationalPrefix: '297' },
  '298': { code: 'FO', name: 'Faroe Islands', nationalPrefix: '298' },
  '299': { code: 'GL', name: 'Greenland', nationalPrefix: '299' },
  '350': { code: 'GI', name: 'Gibraltar', nationalPrefix: '350' },
  '351': { code: 'PT', name: 'Portugal', nationalPrefix: '351' },
  '352': { code: 'LU', name: 'Luxembourg', nationalPrefix: '352' },
  '353': { code: 'IE', name: 'Ireland', nationalPrefix: '353' },
  '354': { code: 'IS', name: 'Iceland', nationalPrefix: '354' },
  '355': { code: 'AL', name: 'Albania', nationalPrefix: '355' },
  '356': { code: 'MT', name: 'Malta', nationalPrefix: '356' },
  '357': { code: 'CY', name: 'Cyprus', nationalPrefix: '357' },
  '358': { code: 'FI', name: 'Finland', nationalPrefix: '358' },
  '359': { code: 'BG', name: 'Bulgaria', nationalPrefix: '359' },
  '370': { code: 'LT', name: 'Lithuania', nationalPrefix: '370' },
  '371': { code: 'LV', name: 'Latvia', nationalPrefix: '371' },
  '372': { code: 'EE', name: 'Estonia', nationalPrefix: '372' },
  '373': { code: 'MD', name: 'Moldova', nationalPrefix: '373' },
  '374': { code: 'AM', name: 'Armenia', nationalPrefix: '374' },
  '375': { code: 'BY', name: 'Belarus', nationalPrefix: '375' },
  '376': { code: 'AD', name: 'Andorra', nationalPrefix: '376' },
  '377': { code: 'MC', name: 'Monaco', nationalPrefix: '377' },
  '378': { code: 'SM', name: 'San Marino', nationalPrefix: '378' },
  '380': { code: 'UA', name: 'Ukraine', nationalPrefix: '380' },
  '381': { code: 'RS', name: 'Serbia', nationalPrefix: '381' },
  '382': { code: 'ME', name: 'Montenegro', nationalPrefix: '382' },
  '385': { code: 'HR', name: 'Croatia', nationalPrefix: '385' },
  '386': { code: 'SI', name: 'Slovenia', nationalPrefix: '386' },
  '387': { code: 'BA', name: 'Bosnia and Herzegovina', nationalPrefix: '387' },
  '389': { code: 'MK', name: 'North Macedonia', nationalPrefix: '389' },
  '420': { code: 'CZ', name: 'Czech Republic', nationalPrefix: '420' },
  '421': { code: 'SK', name: 'Slovakia', nationalPrefix: '421' },
  '852': { code: 'HK', name: 'Hong Kong', nationalPrefix: '852' },
  '853': { code: 'MO', name: 'Macau', nationalPrefix: '853' },
  '855': { code: 'KH', name: 'Cambodia', nationalPrefix: '855' },
  '856': { code: 'LA', name: 'Laos', nationalPrefix: '856' },
  '880': { code: 'BD', name: 'Bangladesh', nationalPrefix: '880' },
  '886': { code: 'TW', name: 'Taiwan', nationalPrefix: '886' },
  '960': { code: 'MV', name: 'Maldives', nationalPrefix: '960' },
  '961': { code: 'LB', name: 'Lebanon', nationalPrefix: '961' },
  '962': { code: 'JO', name: 'Jordan', nationalPrefix: '962' },
  '963': { code: 'SY', name: 'Syria', nationalPrefix: '963' },
  '964': { code: 'IQ', name: 'Iraq', nationalPrefix: '964' },
  '965': { code: 'KW', name: 'Kuwait', nationalPrefix: '965' },
  '966': { code: 'SA', name: 'Saudi Arabia', nationalPrefix: '966' },
  '967': { code: 'YE', name: 'Yemen', nationalPrefix: '967' },
  '968': { code: 'OM', name: 'Oman', nationalPrefix: '968' },
  '971': { code: 'AE', name: 'United Arab Emirates', nationalPrefix: '971' },
  '972': { code: 'IL', name: 'Israel', nationalPrefix: '972' },
  '973': { code: 'BH', name: 'Bahrain', nationalPrefix: '973' },
  '974': { code: 'QA', name: 'Qatar', nationalPrefix: '974' },
  '975': { code: 'BT', name: 'Bhutan', nationalPrefix: '975' },
  '976': { code: 'MN', name: 'Mongolia', nationalPrefix: '976' },
  '977': { code: 'NP', name: 'Nepal', nationalPrefix: '977' },
  '992': { code: 'TJ', name: 'Tajikistan', nationalPrefix: '992' },
  '993': { code: 'TM', name: 'Turkmenistan', nationalPrefix: '993' },
  '994': { code: 'AZ', name: 'Azerbaijan', nationalPrefix: '994' },
  '995': { code: 'GE', name: 'Georgia', nationalPrefix: '995' },
  '996': { code: 'KG', name: 'Kyrgyzstan', nationalPrefix: '996' },
  '998': { code: 'UZ', name: 'Uzbekistan', nationalPrefix: '998' },
};

const MOBILE_PREFIXES: Record<string, { country: string; prefix: string; carrier: string }[]> = {
  US: [
    { country: 'US', prefix: '201', carrier: 'T-Mobile (NY/NJ)' },
    { country: 'US', prefix: '202', carrier: 'AT&T (DC)' },
    { country: 'US', prefix: '203', carrier: 'T-Mobile (CT)' },
    { country: 'US', prefix: '206', carrier: 'T-Mobile (WA)' },
    { country: 'US', prefix: '207', carrier: 'US Cellular (ME)' },
    { country: 'US', prefix: '208', carrier: 'AT&T (ID)' },
    { country: 'US', prefix: '209', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '210', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '212', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '213', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '214', carrier: 'T-Mobile (TX)' },
    { country: 'US', prefix: '215', carrier: 'T-Mobile (PA)' },
    { country: 'US', prefix: '216', carrier: 'T-Mobile (OH)' },
    { country: 'US', prefix: '217', carrier: 'T-Mobile (IL)' },
    { country: 'US', prefix: '218', carrier: 'T-Mobile (MN)' },
    { country: 'US', prefix: '310', carrier: 'T-Mobile (national)' },
    { country: 'US', prefix: '312', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '313', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '314', carrier: 'T-Mobile (MO)' },
    { country: 'US', prefix: '315', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '316', carrier: 'T-Mobile (KS)' },
    { country: 'US', prefix: '317', carrier: 'T-Mobile (IN)' },
    { country: 'US', prefix: '318', carrier: 'T-Mobile (LA)' },
    { country: 'US', prefix: '319', carrier: 'T-Mobile (IA)' },
    { country: 'US', prefix: '320', carrier: 'AT&T (MN)' },
    { country: 'US', prefix: '321', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '323', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '330', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '331', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '334', carrier: 'AT&T (AL)' },
    { country: 'US', prefix: '336', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '337', carrier: 'AT&T (LA)' },
    { country: 'US', prefix: '339', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '347', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '351', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '352', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '360', carrier: 'T-Mobile (WA)' },
    { country: 'US', prefix: '361', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '364', carrier: 'AT&T (KY)' },
    { country: 'US', prefix: '365', carrier: 'AT&T (ON)' },
    { country: 'US', prefix: '385', carrier: 'T-Mobile (UT)' },
    { country: 'US', prefix: '386', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '401', carrier: 'T-Mobile (RI)' },
    { country: 'US', prefix: '402', carrier: 'T-Mobile (NE)' },
    { country: 'US', prefix: '404', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '405', carrier: 'AT&T (OK)' },
    { country: 'US', prefix: '406', carrier: 'AT&T (MT)' },
    { country: 'US', prefix: '407', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '408', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '409', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '410', carrier: 'AT&T (MD)' },
    { country: 'US', prefix: '412', carrier: 'T-Mobile (PA)' },
    { country: 'US', prefix: '414', carrier: 'T-Mobile (WI)' },
    { country: 'US', prefix: '415', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '417', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '423', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '424', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '425', carrier: 'T-Mobile (WA)' },
    { country: 'US', prefix: '430', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '432', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '434', carrier: 'AT&T (VA)' },
    { country: 'US', prefix: '435', carrier: 'T-Mobile (UT)' },
    { country: 'US', prefix: '440', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '442', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '443', carrier: 'AT&T (MD)' },
    { country: 'US', prefix: '469', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '470', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '475', carrier: 'AT&T (CT)' },
    { country: 'US', prefix: '478', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '479', carrier: 'AT&T (AR)' },
    { country: 'US', prefix: '480', carrier: 'T-Mobile (AZ)' },
    { country: 'US', prefix: '502', carrier: 'T-Mobile (KY)' },
    { country: 'US', prefix: '503', carrier: 'T-Mobile (OR)' },
    { country: 'US', prefix: '504', carrier: 'AT&T (LA)' },
    { country: 'US', prefix: '505', carrier: 'T-Mobile (NM)' },
    { country: 'US', prefix: '507', carrier: 'AT&T (MN)' },
    { country: 'US', prefix: '508', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '509', carrier: 'T-Mobile (WA)' },
    { country: 'US', prefix: '510', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '512', carrier: 'T-Mobile (TX)' },
    { country: 'US', prefix: '513', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '515', carrier: 'AT&T (IA)' },
    { country: 'US', prefix: '516', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '517', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '518', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '520', carrier: 'AT&T (AZ)' },
    { country: 'US', prefix: '530', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '531', carrier: 'AT&T (NE)' },
    { country: 'US', prefix: '534', carrier: 'AT&T (WI)' },
    { country: 'US', prefix: '539', carrier: 'AT&T (OK)' },
    { country: 'US', prefix: '541', carrier: 'AT&T (OR)' },
    { country: 'US', prefix: '551', carrier: 'T-Mobile (NJ)' },
    { country: 'US', prefix: '559', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '561', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '562', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '563', carrier: 'AT&T (IA)' },
    { country: 'US', prefix: '567', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '570', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '571', carrier: 'AT&T (VA)' },
    { country: 'US', prefix: '573', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '574', carrier: 'AT&T (IN)' },
    { country: 'US', prefix: '575', carrier: 'AT&T (NM)' },
    { country: 'US', prefix: '580', carrier: 'AT&T (OK)' },
    { country: 'US', prefix: '585', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '586', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '601', carrier: 'AT&T (MS)' },
    { country: 'US', prefix: '602', carrier: 'T-Mobile (AZ)' },
    { country: 'US', prefix: '603', carrier: 'AT&T (NH)' },
    { country: 'US', prefix: '605', carrier: 'T-Mobile (SD)' },
    { country: 'US', prefix: '606', carrier: 'AT&T (KY)' },
    { country: 'US', prefix: '607', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '608', carrier: 'AT&T (WI)' },
    { country: 'US', prefix: '609', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '610', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '612', carrier: 'T-Mobile (MN)' },
    { country: 'US', prefix: '614', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '615', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '616', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '617', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '618', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '619', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '620', carrier: 'AT&T (KS)' },
    { country: 'US', prefix: '623', carrier: 'T-Mobile (AZ)' },
    { country: 'US', prefix: '626', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '628', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '629', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '630', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '631', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '636', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '641', carrier: 'AT&T (IA)' },
    { country: 'US', prefix: '646', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '650', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '651', carrier: 'AT&T (MN)' },
    { country: 'US', prefix: '657', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '660', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '661', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '662', carrier: 'AT&T (MS)' },
    { country: 'US', prefix: '667', carrier: 'AT&T (MD)' },
    { country: 'US', prefix: '669', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '678', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '681', carrier: 'AT&T (WV)' },
    { country: 'US', prefix: '682', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '701', carrier: 'AT&T (ND)' },
    { country: 'US', prefix: '702', carrier: 'T-Mobile (NV)' },
    { country: 'US', prefix: '703', carrier: 'AT&T (VA)' },
    { country: 'US', prefix: '704', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '706', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '707', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '708', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '712', carrier: 'AT&T (IA)' },
    { country: 'US', prefix: '713', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '714', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '715', carrier: 'AT&T (WI)' },
    { country: 'US', prefix: '716', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '717', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '718', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '719', carrier: 'AT&T (CO)' },
    { country: 'US', prefix: '720', carrier: 'AT&T (CO)' },
    { country: 'US', prefix: '724', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '725', carrier: 'AT&T (NV)' },
    { country: 'US', prefix: '727', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '731', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '732', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '734', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '737', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '740', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '743', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '747', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '754', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '757', carrier: 'AT&T (VA)' },
    { country: 'US', prefix: '760', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '762', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '763', carrier: 'AT&T (MN)' },
    { country: 'US', prefix: '765', carrier: 'AT&T (IN)' },
    { country: 'US', prefix: '769', carrier: 'AT&T (MS)' },
    { country: 'US', prefix: '770', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '772', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '773', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '774', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '775', carrier: 'AT&T (NV)' },
    { country: 'US', prefix: '779', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '781', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '785', carrier: 'AT&T (KS)' },
    { country: 'US', prefix: '786', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '801', carrier: 'T-Mobile (UT)' },
    { country: 'US', prefix: '802', carrier: 'AT&T (VT)' },
    { country: 'US', prefix: '803', carrier: 'AT&T (SC)' },
    { country: 'US', prefix: '804', carrier: 'AT&T (VA)' },
    { country: 'US', prefix: '805', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '808', carrier: 'AT&T (HI)' },
    { country: 'US', prefix: '810', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '812', carrier: 'AT&T (IN)' },
    { country: 'US', prefix: '813', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '814', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '815', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '816', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '817', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '818', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '828', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '830', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '831', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '832', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '843', carrier: 'AT&T (SC)' },
    { country: 'US', prefix: '845', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '847', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '848', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '850', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '854', carrier: 'AT&T (SC)' },
    { country: 'US', prefix: '856', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '857', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '858', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '859', carrier: 'AT&T (KY)' },
    { country: 'US', prefix: '860', carrier: 'AT&T (CT)' },
    { country: 'US', prefix: '862', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '863', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '864', carrier: 'AT&T (SC)' },
    { country: 'US', prefix: '865', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '870', carrier: 'AT&T (AR)' },
    { country: 'US', prefix: '872', carrier: 'AT&T (IL)' },
    { country: 'US', prefix: '878', carrier: 'AT&T (PA)' },
    { country: 'US', prefix: '901', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '903', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '904', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '906', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '907', carrier: 'AT&T (AK)' },
    { country: 'US', prefix: '908', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '909', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '910', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '912', carrier: 'AT&T (GA)' },
    { country: 'US', prefix: '913', carrier: 'AT&T (KS)' },
    { country: 'US', prefix: '914', carrier: 'AT&T (NY)' },
    { country: 'US', prefix: '915', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '916', carrier: 'T-Mobile (CA)' },
    { country: 'US', prefix: '917', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '918', carrier: 'AT&T (OK)' },
    { country: 'US', prefix: '919', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '920', carrier: 'AT&T (WI)' },
    { country: 'US', prefix: '925', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '928', carrier: 'AT&T (AZ)' },
    { country: 'US', prefix: '929', carrier: 'T-Mobile (NY)' },
    { country: 'US', prefix: '930', carrier: 'AT&T (IN)' },
    { country: 'US', prefix: '931', carrier: 'AT&T (TN)' },
    { country: 'US', prefix: '936', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '937', carrier: 'AT&T (OH)' },
    { country: 'US', prefix: '938', carrier: 'AT&T (AL)' },
    { country: 'US', prefix: '940', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '941', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '947', carrier: 'AT&T (MI)' },
    { country: 'US', prefix: '949', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '951', carrier: 'AT&T (CA)' },
    { country: 'US', prefix: '952', carrier: 'AT&T (MN)' },
    { country: 'US', prefix: '954', carrier: 'AT&T (FL)' },
    { country: 'US', prefix: '956', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '959', carrier: 'AT&T (CT)' },
    { country: 'US', prefix: '970', carrier: 'AT&T (CO)' },
    { country: 'US', prefix: '971', carrier: 'AT&T (OR)' },
    { country: 'US', prefix: '972', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '973', carrier: 'AT&T (NJ)' },
    { country: 'US', prefix: '975', carrier: 'AT&T (MO)' },
    { country: 'US', prefix: '978', carrier: 'AT&T (MA)' },
    { country: 'US', prefix: '979', carrier: 'AT&T (TX)' },
    { country: 'US', prefix: '980', carrier: 'AT&T (SC)' },
    { country: 'US', prefix: '984', carrier: 'AT&T (NC)' },
    { country: 'US', prefix: '985', carrier: 'AT&T (LA)' },
  ],
  GB: [
    { country: 'GB', prefix: '71', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '72', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '73', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '74', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '75', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '76', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '77', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '78', carrier: 'EE/O2/Vodafone (UK Mobile)' },
    { country: 'GB', prefix: '79', carrier: 'EE/O2/Vodafone (UK Mobile)' },
  ],
};

const KNOWN_VIP_NUMBERS: Record<string, string> = {
  '1800': 'Toll-free (US)',
  '1888': 'Toll-free (US)',
  '1877': 'Toll-free (US)',
  '1866': 'Toll-free (US)',
  '1855': 'Toll-free (US)',
  '1844': 'Toll-free (US)',
  '1833': 'Toll-free (US)',
  '1900': 'Premium-rate (US)',
  '1976': 'Premium-rate (US)',
  '0800': 'Toll-free (UK)',
  '0808': 'Freephone (UK)',
  '0845': 'Local-rate (UK)',
  '0870': 'National-rate (UK)',
};

function stripFormatting(input: string): string {
  return input.replace(/[^0-9+]/g, '');
}

function parsePhone(
  raw: string
): { e164: string; digits: string; countryCode: string; countryName: string; nationalNumber: string } | null {
  let cleaned = stripFormatting(raw);
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length < 7 || cleaned.length > 15) return null;

  let matchedCode = '';
  let matchedInfo = { code: '', name: '', nationalPrefix: '' };
  for (const code of Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length)) {
    if (cleaned.startsWith(code)) {
      matchedCode = code;
      const entry = COUNTRY_CODES[code];
      if (entry) matchedInfo = entry;
      break;
    }
  }
  if (!matchedCode) return null;

  const nationalNumber = cleaned.slice(matchedCode.length);
  if (nationalNumber.length < 4 || nationalNumber.length > 12) return null;

  const e164 = `+${cleaned}`;
  return {
    e164,
    digits: cleaned,
    countryCode: matchedInfo.code,
    countryName: matchedInfo.name,
    nationalNumber,
  };
}

function detectLineType(parsed: ReturnType<typeof parsePhone>): { type: string; carrier: string; confidence: string } {
  if (!parsed) return { type: 'unknown', carrier: 'Unknown', confidence: 'low' };

  const { countryCode, nationalNumber } = parsed;

  const vipCheck = KNOWN_VIP_NUMBERS[nationalNumber.slice(0, 4)];
  if (vipCheck) return { type: 'special', carrier: vipCheck, confidence: 'high' };

  const prefix3 = nationalNumber.slice(0, 3);
  const prefix4 = nationalNumber.slice(0, 4);

  if (countryCode === 'US' || countryCode === 'CA') {
    if (prefix3 === '900' || prefix4 === '976') return { type: 'premium', carrier: 'Premium-rate', confidence: 'high' };
    if (
      prefix3 === '800' ||
      prefix3 === '888' ||
      prefix3 === '877' ||
      prefix3 === '866' ||
      prefix3 === '855' ||
      prefix3 === '844' ||
      prefix3 === '833'
    ) {
      return { type: 'toll-free', carrier: 'Toll-free', confidence: 'high' };
    }
    if (prefix3 === '500' || prefix3 === '522' || prefix3 === '533' || prefix3 === '544' || prefix3 === '566') {
      return { type: 'voip', carrier: 'Personal VoIP', confidence: 'medium' };
    }
    const mobilePrefixes = MOBILE_PREFIXES.US;
    if (mobilePrefixes) {
      const match = mobilePrefixes.find((m) => nationalNumber.startsWith(m.prefix));
      if (match) return { type: 'mobile', carrier: match.carrier, confidence: 'medium' };
    }
    if (
      prefix3.startsWith('2') ||
      prefix3.startsWith('3') ||
      prefix3.startsWith('4') ||
      prefix3.startsWith('6') ||
      prefix3.startsWith('7') ||
      prefix3.startsWith('8') ||
      prefix3.startsWith('9')
    ) {
      return { type: 'landline', carrier: 'Landline', confidence: 'low' };
    }
    return { type: 'unknown', carrier: 'Unknown', confidence: 'low' };
  }

  if (countryCode === 'GB') {
    const gbMobile = MOBILE_PREFIXES.GB;
    if (gbMobile && gbMobile.some((m) => nationalNumber.startsWith(m.prefix))) {
      return { type: 'mobile', carrier: 'UK Mobile (EE/O2/Vodafone/Three)', confidence: 'medium' };
    }
    if (nationalNumber.startsWith('20') || nationalNumber.startsWith('1')) {
      return { type: 'landline', carrier: 'UK Landline', confidence: 'medium' };
    }
    return { type: 'unknown', carrier: 'Unknown', confidence: 'low' };
  }

  if (countryCode === 'IN') {
    if (
      nationalNumber.startsWith('6') ||
      nationalNumber.startsWith('7') ||
      nationalNumber.startsWith('8') ||
      nationalNumber.startsWith('9')
    ) {
      if (nationalNumber.startsWith('180') || nationalNumber.startsWith('186') || nationalNumber.startsWith('187')) {
        return { type: 'toll-free', carrier: 'India Toll-free', confidence: 'high' };
      }
      return { type: 'mobile', carrier: 'India Mobile', confidence: 'medium' };
    }
    return { type: 'landline', carrier: 'India Landline', confidence: 'low' };
  }

  if (countryCode === 'DE') {
    if (nationalNumber.startsWith('15') || nationalNumber.startsWith('16') || nationalNumber.startsWith('17')) {
      return { type: 'mobile', carrier: 'Germany Mobile (Telekom/O2/Vodafone)', confidence: 'medium' };
    }
    if (nationalNumber.startsWith('800'))
      return { type: 'toll-free', carrier: 'Germany Toll-free', confidence: 'high' };
    return { type: 'landline', carrier: 'Germany Landline', confidence: 'low' };
  }

  if (countryCode === 'FR') {
    if (nationalNumber.startsWith('6') || nationalNumber.startsWith('7')) {
      return { type: 'mobile', carrier: 'France Mobile (Orange/SFR/Bouygues/Free)', confidence: 'medium' };
    }
    if (
      nationalNumber.startsWith('800') ||
      nationalNumber.startsWith('801') ||
      nationalNumber.startsWith('802') ||
      nationalNumber.startsWith('803') ||
      nationalNumber.startsWith('804') ||
      nationalNumber.startsWith('805') ||
      nationalNumber.startsWith('806') ||
      nationalNumber.startsWith('807') ||
      nationalNumber.startsWith('808') ||
      nationalNumber.startsWith('809')
    ) {
      return { type: 'toll-free', carrier: 'France Toll-free', confidence: 'high' };
    }
    if (nationalNumber.startsWith('9')) return { type: 'mobile', carrier: 'France Mobile', confidence: 'medium' };
    return { type: 'landline', carrier: 'France Landline', confidence: 'low' };
  }

  if (nationalNumber.startsWith('1') || nationalNumber.startsWith('5')) {
    return { type: 'mobile', carrier: 'Mobile (prefix heuristic)', confidence: 'low' };
  }
  return { type: 'landline', carrier: 'Landline (prefix heuristic)', confidence: 'low' };
}

function buildLookups(
  e164: string,
  digits: string,
  countryCode: string
): Array<{ service: string; url: string; category: string; free: boolean }> {
  const lookups: Array<{ service: string; url: string; category: string; free: boolean }> = [];

  lookups.push({ service: 'WhatsApp', url: `https://wa.me/${digits}`, category: 'messaging', free: true });
  lookups.push({ service: 'Telegram', url: `https://t.me/+${digits}`, category: 'messaging', free: true });
  lookups.push({
    service: 'Viber',
    url: `viber://chat?number=${encodeURIComponent(e164)}`,
    category: 'messaging',
    free: true,
  });
  lookups.push({
    service: 'TrueCaller',
    url: `https://www.truecaller.com/search/${countryCode.toLowerCase()}/${digits}`,
    category: 'lookup',
    free: true,
  });
  lookups.push({
    service: 'NumLookup',
    url: `https://www.numlookup.com/lookup?number=${encodeURIComponent(digits)}&country=${countryCode}`,
    category: 'lookup',
    free: true,
  });
  lookups.push({
    service: 'WhitePages',
    url: `https://www.whitepages.com/phone/${encodeURIComponent(digits)}`,
    category: 'directory',
    free: true,
  });
  lookups.push({
    service: 'Sync.me',
    url: `https://sync.me/search/?type=phone&number=${encodeURIComponent(e164)}`,
    category: 'caller-id',
    free: true,
  });
  lookups.push({
    service: 'Spokeo',
    url: `https://www.spokeo.com/phone-lookup/${encodeURIComponent(digits)}`,
    category: 'people-search',
    free: false,
  });
  lookups.push({
    service: 'BeenVerified',
    url: `https://www.beenverified.com/phone/${encodeURIComponent(digits)}`,
    category: 'people-search',
    free: false,
  });
  lookups.push({
    service: 'CallerID Test',
    url: `https://calleridtest.com/number/${encodeURIComponent(digits)}`,
    category: 'caller-id',
    free: true,
  });
  lookups.push({
    service: 'PhoneInfoga (OSINT)',
    url: `https://phoneinfoga.toolsgo.xyz/?number=${encodeURIComponent(e164)}`,
    category: 'osint',
    free: true,
  });

  if (countryCode === 'US' || countryCode === 'CA') {
    lookups.push({ service: 'FCC CNAM', url: `https://www.fcc.gov/caller-id`, category: 'regulatory', free: true });
    lookups.push({
      service: 'National Do Not Call',
      url: `https://www.donotcall.gov/`,
      category: 'regulatory',
      free: true,
    });
  }
  if (countryCode === 'GB') {
    lookups.push({ service: 'TPS (UK DNC)', url: `https://www.tpsonline.org.uk/`, category: 'regulatory', free: true });
  }
  if (countryCode === 'AU') {
    lookups.push({
      service: 'ACMA Spam Register',
      url: `https://www.acma.gov.au/spam-register`,
      category: 'regulatory',
      free: true,
    });
  }

  return lookups;
}

function buildDorks(
  digits: string,
  e164: string,
  countryCode: string
): Array<{ engine: string; query: string; url: string }> {
  const dorks: Array<{ engine: string; query: string; url: string }> = [];

  const escapedDigits = encodeURIComponent(`"${digits}"`);
  const escapedE164 = encodeURIComponent(`"${e164}"`);

  dorks.push({
    engine: 'google',
    query: `"${digits}" OR "${e164}"`,
    url: `https://www.google.com/search?q=${escapedDigits}+OR+${escapedE164}`,
  });

  dorks.push({
    engine: 'google-images',
    query: `"${digits}"`,
    url: `https://www.google.com/search?q=${escapedDigits}&tbm=isch`,
  });

  dorks.push({
    engine: 'bing',
    query: `"${digits}" OR "${e164}"`,
    url: `https://www.bing.com/search?q=${escapedDigits}+OR+${escapedE164}`,
  });

  dorks.push({
    engine: 'duckduckgo',
    query: `"${digits}"`,
    url: `https://duckduckgo.com/?q=${escapedDigits}`,
  });

  dorks.push({
    engine: 'yandex',
    query: `"${digits}"`,
    url: `https://yandex.com/search/?text=${escapedDigits}`,
  });

  if (countryCode === 'US') {
    dorks.push({
      engine: 'google',
      query: `site:whitepages.com OR site:spokeo.com OR site:truecaller.com "${digits}"`,
      url: `https://www.google.com/search?q=site%3Awhitepages.com+OR+site%3Aspokeo.com+OR+site%3Atruecaller.com+${escapedDigits}`,
    });
  }

  dorks.push({
    engine: 'google',
    query: `site:facebook.com OR site:linkedin.com OR site:instagram.com "${digits}"`,
    url: `https://www.google.com/search?q=site%3Afacebook.com+OR+site%3Alinkedin.com+OR+site%3Ainstagram.com+${escapedDigits}`,
  });

  dorks.push({
    engine: 'google',
    query: `site:twitter.com OR site:x.com "${digits}"`,
    url: `https://www.google.com/search?q=site%3Atwitter.com+OR+site%3Ax.com+${escapedDigits}`,
  });

  dorks.push({
    engine: 'google',
    query: `site:github.com "${digits}"`,
    url: `https://www.google.com/search?q=site%3Agithub.com+${escapedDigits}`,
  });

  dorks.push({
    engine: 'google',
    query: `site:pastebin.com OR site:hastebin.com "${digits}"`,
    url: `https://www.google.com/search?q=site%3Apastebin.com+OR+site%3Ahastebin.com+${escapedDigits}`,
  });

  return dorks;
}

async function checkBreach(
  digits: string,
  env: Env
): Promise<{ checked: boolean; reason: string; stealerStats?: unknown }> {
  try {
    const key = env.ADMIN_TOKEN;
    const target = `/api/v1/hudsonrock/username?username=${encodeURIComponent(digits)}`;
    const res = await env.SELF.fetch(`https://internal${target}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { checked: false, reason: `Hudson Rock returned ${res.status}` };
    const data = await res.json();
    return { checked: true, reason: 'ok', stealerStats: data };
  } catch {
    return { checked: false, reason: 'Hudson Rock integration unavailable' };
  }
}

async function tryNumVerify(digits: string, env: Env): Promise<Record<string, string> | null> {
  const apiKey = (env as unknown as Record<string, unknown>).NUMVERIFY_API_KEY as string | undefined;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://apilayer.net/api/validate?access_key=${apiKey}&number=${digits}&country_code=&format=1`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.valid) return null;
    return {
      local_format: String(data.local_format ?? ''),
      international_format: String(data.international_format ?? ''),
      country_prefix: String(data.country_prefix ?? ''),
      country_code: String(data.country_code ?? ''),
      country_name: String(data.country_name ?? ''),
      location: String(data.location ?? ''),
      carrier: String(data.carrier ?? ''),
      line_type: String(data.line_type ?? ''),
    };
  } catch {
    return null;
  }
}

export async function phoneOsintHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('phone')?.trim();
  if (!raw) return c.json({ error: 'missing phone parameter' }, 400);

  const parsed = parsePhone(raw);
  if (!parsed) return c.json({ error: 'invalid or unsupported phone number format' }, 400);

  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://phone-osint.internal/v1?p=${parsed.digits}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  const [numVerify, breachResult] = await Promise.all([
    tryNumVerify(parsed.digits, c.env),
    checkBreach(parsed.digits, c.env),
  ]);

  const lineType = detectLineType(parsed);
  const lookups = buildLookups(parsed.e164, parsed.digits, parsed.countryCode);
  const dorks = buildDorks(parsed.digits, parsed.e164, parsed.countryCode);

  const carrierResult = numVerify?.carrier
    ? { type: numVerify.line_type || lineType.type, carrier: numVerify.carrier, confidence: 'api-verified' }
    : lineType;

  const body = {
    phone: {
      e164: parsed.e164,
      digits: parsed.digits,
      country_code: parsed.countryCode,
      country_name: parsed.countryName,
      national_number: parsed.nationalNumber,
    },
    carrier: carrierResult,
    numverify: numVerify,
    lookups,
    dorks,
    breach: breachResult,
    generated_at: new Date().toISOString(),
    cached: false,
  };

  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}
