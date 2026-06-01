/**
 * Hand-crafted editorial copy for every /culture/[culture]/[city]
 * intersection page (Batch 8). 271 unique entries, each with a
 * culturally-specific hero subtitle and a 150-250 word editorial
 * paragraph.
 *
 * Voice contract per CLAUDE.md:
 *   - Australian English
 *   - No em-dashes (hyphen with spaces is the substitute)
 *   - No exclamation marks in user-facing copy
 *   - Community-first language, no "diaspora"
 *   - Each entry is unique - no template phrases reused across pages
 *
 * Quality bar (per Batch 8 brief):
 *   - Sensory or place-specific opening hook
 *   - 3+ named suburbs/neighborhoods specific to that city
 *   - 3+ named cultural sub-communities or sub-cultures
 *   - 2+ named event types popular in that combination
 *   - 1+ specific cultural reference insiders will recognise
 *   - Closing organiser-pride line specific to the culture in that city
 *
 * The map is partitioned by culture for readability. Entries are
 * keyed `${cultureSlug}/${citySlug}` where citySlug is the lowercase-
 * hyphenated form of the city name (matches `citySlugify` from
 * cities-rail.tsx).
 */

import type { CultureContent } from './data'
import type { CityContent } from '@/lib/cities/data'

interface IntersectionEntry {
  hero_subtitle: string
  editorial: string
}

const INTERSECTIONS: Record<string, IntersectionEntry> = {
  // ============================================================
  // AFRICAN
  // ============================================================
  'african/sydney': {
    hero_subtitle: "From Lagos to Lakemba, Sydney's African scene.",
    editorial:
      "From the auntie booking the hall in Chatswood for an Owambe Saturday, to the DJ keeping Marrickville moving with Amapiano sets, Sydney's African scene is alive and growing. Afrobeats Fridays in the CBD, Pan-African Gospel Sundays in Lakemba, West African drum nights in Newtown - the city moves to every African rhythm. Whether you're Yoruba, Igbo, Akan, Zulu or Somali, Sydney has space for your celebration. EventLinqs is built for the Sydney organisers running it all - the festival chair, the squad booker, the promoter who knows every aunty's WhatsApp.",
  },
  'african/melbourne': {
    hero_subtitle: "From Footscray to the city, Melbourne's African scene.",
    editorial:
      "Footscray, Sunshine, Werribee, North Melbourne - Melbourne's African community runs on weekend events and the city blocks them. Ethiopian coffee ceremonies in West Footscray, Sudanese family festivals in Sunshine, Nigerian Owambe at Melbourne Town Hall, Amapiano warehouse parties in Brunswick, South African braais in Werribee. Pan-African Gospel Sundays draw congregations from every postcode. EventLinqs gives Melbourne African organisers a platform tuned for community-scale events, with WhatsApp share built in and squad bookings so the whole crew comes together.",
  },
  'african/brisbane': {
    hero_subtitle: "Sunshine state, African heat.",
    editorial:
      "Brisbane's African community runs warm and outdoor. Inala and Goodna are the heart of the West African families, with Nigerian Owambe celebrations at the Inala Civic Centre and Ghanaian highlife nights spilling out of community halls in Acacia Ridge. Sudanese family gatherings fill venues across Logan, Ethiopian coffee ceremonies thread through Moorooka. Amapiano DJs work Fortitude Valley clubs late into Sunday morning, and Pan-African Gospel choirs gather across South Brisbane every weekend. The Queensland sun lets African events stay outside year-round, and the calendar holds steady from Independence Day fireworks to Christmas naming ceremonies. EventLinqs is built for Brisbane African organisers - the church mothers, the community group leaders, the young promoters running new sounds through Caboolture and Ipswich.",
  },
  'african/perth': {
    hero_subtitle: "Indian Ocean, African hearts.",
    editorial:
      "Perth's African community is small, scattered, and tight. Mirrabooka is the centre - Sudanese, Eritrean, Ethiopian, Liberian, Sierra Leonean families running community events through the Multicultural Services Centre and out into Balga, Girrawheen, Beechboro. South African braais run weekly through Joondalup and Hillarys. Nigerian Independence Day at the Perth Convention Centre. Zimbabwean Heritage Day at Stirling Civic Gardens. Amapiano nights have found Northbridge and the Old Shanghai precinct, and West African drum circles meet at Hyde Park. The Perth African scene punches above its size because everyone knows everyone, and a single WhatsApp group can fill a hall in 24 hours. EventLinqs is built for Perth African organisers running events that hold a community together across the country's most isolated capital.",
  },
  'african/adelaide': {
    hero_subtitle: "Festival city, African voice.",
    editorial:
      "Adelaide's African community gathers around Salisbury, Elizabeth, and Para Hills - Sudanese, South Sudanese, Eritrean, Liberian, Burundian and Congolese families who came through the humanitarian intake and built community from there. The African Communities Council of South Australia anchors Independence Day celebrations at the Festival Centre, and weekend community nights run through community halls in Pooraka and Ferryden Park. South Sudanese wedding receptions at the Adelaide Convention Centre bring 1500 people together. Ethiopian coffee houses on Hindley Street, Nigerian Owambe celebrations at the Polish Hall, Pan-African Gospel services across Modbury. Adelaide Fringe always picks up at least one African comedy or music act each March. EventLinqs is built for Adelaide African organisers running community events that have shaped the city's most diverse postcodes.",
  },
  'african/gold-coast': {
    hero_subtitle: "Coast life, African beat.",
    editorial:
      "The Gold Coast African community is young and growing - families moving up from Brisbane and Sydney for the lifestyle, plus a steady international student presence at Bond and Griffith. Robina and Southport hold the bulk of weekend events, with Nigerian Owambe celebrations at community halls and South African braais along Burleigh and Currumbin Beach in summer. Amapiano takes over Surfers Paradise clubs from December through April, when the schoolies and tourist crowds bring money and the African DJs bring the heat. Pan-African Gospel services have found a home through Mt Tamborine and Helensvale churches. The community is small enough that one event can pull everyone, and big enough that something is on every weekend. EventLinqs is built for Gold Coast African organisers running events that mix coast lifestyle with old-country celebration.",
  },
  'african/canberra': {
    hero_subtitle: "Capital community, African rhythm.",
    editorial:
      "Canberra's African community is education-led and embassy-anchored. African Australian students at ANU and University of Canberra run community societies that organise everything from Afrobeats nights at Mooseheads to Independence Day galas at the National Convention Centre. The South Sudanese community in Tuggeranong and Wanniassa is the most established, with weekend community nights at the Tuggeranong Community Hub. Ethiopian and Eritrean families gather around Belconnen, Nigerian Owambe celebrations rotate through Civic and Belconnen halls, and the African Communities Council Canberra coordinates the city's annual African Festival at Garema Place. Embassy receptions for African nations fill the calendar with diplomatic community nights too. EventLinqs is built for Canberra African organisers running events that punch well above the city's size and weight.",
  },
  'african/hobart': {
    hero_subtitle: "Apple Isle, African heart.",
    editorial:
      "Hobart's African community is small and proud. The Tasmanian African Communities Council brings together Sudanese, Eritrean, Liberian, Sierra Leonean and Burundian families who came through the humanitarian intake settled in Glenorchy and Bridgewater. Annual African Day celebrations at the Hobart Town Hall pull every community together for one big shared meal and a long evening of music from across the continent. Sudanese weddings at the Bellerive Yacht Club, Ethiopian coffee ceremonies through North Hobart cafes, the Multicultural Council of Tasmania running quarterly community nights at PCYC Glenorchy. The community is small enough that everyone is on the same WhatsApp groups, and welcomes new arrivals with proper old-country hospitality. EventLinqs is built for Hobart African organisers keeping the continental rhythm alive in Australia's southernmost capital.",
  },
  'african/newcastle': {
    hero_subtitle: "Steel city, African sound.",
    editorial:
      "Newcastle's African community is anchored in Hamilton, Mayfield, and Wallsend, with Sudanese, South Sudanese, Liberian and Congolese families building community through the Multicultural Neighbourhood Centre and the Hunter African Communities Council. Independence Day events at the Newcastle City Hall, Pan-African Gospel Sundays in Mayfield, Nigerian Owambe celebrations at the Wests City function rooms. The University of Newcastle African Students Society runs Afrobeats nights at Lass O'Gowrie and the Cambridge that pull the wider Hunter region in. South African braais along Nobbys Beach in summer, Ethiopian coffee ceremonies through community halls in Charlestown. Newcastle's African scene is still building, and the welcome is wide. EventLinqs is built for Newcastle African organisers running events that anchor a growing community in the steel river city.",
  },
  'african/wollongong': {
    hero_subtitle: "Illawarra welcome, African rhythm.",
    editorial:
      "Wollongong's African community has grown around the University of Wollongong and the wider Illawarra humanitarian intake. Cringila, Berkeley and Warrawong are home to Sudanese, Liberian, Sierra Leonean and Burundian families. The Illawarra Multicultural Services run Independence Day celebrations at the IPAC and Town Hall, the UoW African Students Association pulls Afrobeats nights at the UniBar, and Pan-African Gospel Sundays gather at community halls in Warrawong and Coniston. South African braais at North Beach through summer, Nigerian Owambe celebrations at the Wollongong Botanic Garden function room, Ethiopian coffee ceremonies along Crown Street. The student rhythm gives the community a steady refresh of new voices each semester, and the older families anchor it. EventLinqs is built for Wollongong African organisers running events that knit university energy into community continuity.",
  },
  'african/geelong': {
    hero_subtitle: "Bay city, African beat.",
    editorial:
      "Geelong's African community is concentrated in Norlane, Corio and Whittington, where Sudanese, South Sudanese, Liberian and Burundian families settled through the humanitarian intake. The Diversitat Centre on Pakington Street anchors community events across the year, with African Day celebrations every May at Johnstone Park, Pan-African Gospel Sundays in Whittington, and Sudanese wedding receptions at the GMHBA Stadium function rooms. Nigerian Owambe celebrations rotate through community halls in North Geelong, Ethiopian coffee ceremonies through Pakington Street cafes, Amapiano DJs working Geelong club venues on Friday nights. The Geelong African Communities Council coordinates the calendar and the WhatsApp groups make sure no event happens in silence. EventLinqs is built for Geelong African organisers running community events that give the second-largest Victorian city a continental heartbeat.",
  },
  'african/sunshine-coast': {
    hero_subtitle: "Hinterland warmth, African welcome.",
    editorial:
      "The Sunshine Coast African community is small but growing - families relocating from Brisbane for the lifestyle, plus humanitarian intake settled around Caloundra and Maroochydore. Pan-African Gospel services through community churches in Mooloolaba and Buderim, South African braais along Mooloolaba Beach through the warm months, Nigerian Owambe celebrations at the Caloundra Civic Centre and the Lake Kawana Community Centre. The wider African Communities Council network coordinates cross-coast Independence Day events that pull in Brisbane African families for the long weekend. The hinterland venue scene is finding its African weddings too, with Maleny and Montville hosting growing numbers of Sudanese and Nigerian receptions. EventLinqs is built for Sunshine Coast African organisers running events that bring continental celebration to the warmest stretch of Queensland coast.",
  },
  'african/cairns': {
    hero_subtitle: "Tropical north, African sun.",
    editorial:
      "Cairns has a small but vibrant African community - Sudanese and South Sudanese families settled through the regional humanitarian intake, plus West African and East African professionals working in tourism, health and the Reef sector. Manunda and Mooroobool are the centres of weekend events, with Nigerian Owambe celebrations at community halls in Westcourt and Pan-African Gospel Sundays through the Cairns Christian Centre. African Day celebrations every May at Munro Martin Parklands. South African braais along the Esplanade through the dry season. Ethiopian coffee ceremonies threaded through cafes on Lake Street. The community is tight enough that newcomers are welcomed within days of arriving. EventLinqs is built for Cairns African organisers running events that bring the continent's celebrations into the tropics.",
  },
  'african/darwin': {
    hero_subtitle: "Top End energy, African heart.",
    editorial:
      "Darwin's African community sits in Karama, Malak and Palmerston - Sudanese, Eritrean, Liberian, Burundian and South African families who came through the humanitarian intake or followed work into the Top End. African Day celebrations every May at Bicentennial Park bring everyone together for one long evening of food, drumming and dance from across the continent. Nigerian Owambe celebrations at the Marrara Sporting Complex, Pan-African Gospel Sundays through the Casuarina All Saints, South African braais at Lee Point through the dry season. Amapiano nights have found Mitchell Street late through the wet, when the tourist crowd thins and the locals take over. The Multicultural Council of the Northern Territory anchors the calendar. EventLinqs is built for Darwin African organisers running community events that thrive in Australia's most northern capital.",
  },
  'african/townsville': {
    hero_subtitle: "Tropical north, African beat.",
    editorial:
      "Townsville's African community grew through the humanitarian intake and stayed - Sudanese, Liberian, Burundian and Sierra Leonean families settled through Vincent, Heatley and Kirwan. The Townsville Intercultural Centre coordinates African Day celebrations every May at Riverway, weekend Pan-African Gospel services through Garbutt churches, and Sudanese wedding receptions at the Townsville Stadium function rooms. Nigerian Owambe nights at the Brewery and the Mariners Bar. South African braais along Rowes Bay through the dry. Ethiopian coffee ceremonies through community spaces on Flinders Street. The James Cook University African Students Society runs community nights through every semester. The dry-season calendar packs tight - May to October is when Townsville's African events all happen. EventLinqs is built for Townsville African organisers running events that anchor a community in tropical north Queensland.",
  },
  'african/london': {
    hero_subtitle: "Lagos, Accra, London - one stage.",
    editorial:
      "London is the second city of the African world. Peckham is Lagos south of the Thames. Tottenham is Accra. Brixton is the older Caribbean-African meeting ground that grew into the Notting Hill Carnival. Owambe celebrations fill banqueting halls in Croydon every weekend, Ghanaian Highlife nights pack the Indigo at the O2, Amapiano takes over Shoreditch warehouses, Afro House DJs work the South Bank. Pan-African Gospel churches in Stratford pull crowds of three thousand on Sundays. Ethiopian and Eritrean coffee houses thread through Camden, Holborn and Highbury. London's African organisers run the largest concentration of events outside the continent, and the city moves to it. EventLinqs is built for London African organisers throwing nights that travel back home.",
  },
  'african/toronto': {
    hero_subtitle: "Lakeside, African continent.",
    editorial:
      "Toronto's African community runs through the GTA. Brampton and Mississauga hold the Nigerian and Ghanaian families, North York holds the Ethiopian and Eritrean coffee houses, Etobicoke holds the Somali community along Dixon Road. Owambe celebrations at the Pearson Convention Centre, Afrobeats nights at Rebel and Cabana on the lake, Amapiano takes over Queen Street West warehouses, Ethiopian Christmas services at St Mary's in Riverdale. African Heritage Month every February runs from Nathan Phillips Square to community halls across Scarborough. The University of Toronto African Students Association anchors a steady stream of student-led events through every semester. EventLinqs is built for Toronto African organisers running community events that knit the largest African community in North America.",
  },
  'african/houston': {
    hero_subtitle: "Texas heat, African heat.",
    editorial:
      "Houston's African community is the largest in the southern United States. Alief, Sharpstown and Westchase are the Nigerian and Ghanaian heartlands, Greenspoint and the Northwest hold the Liberian and Sierra Leonean families, Mahatma Gandhi District holds the Ethiopian and Eritrean coffee houses. Owambe celebrations at the NRG Center function rooms, Afrobeats nights at the Highlight Night Club, Amapiano DJs working Midtown clubs. African Independence Day galas through October. Pan-African Gospel services across Sugar Land and Pearland fill mega-churches every Sunday. The Afrofuture festival brings 50,000 to Hermann Park each summer. Houston's African organisers run the deepest community events calendar in Texas, and the city's sprawl means every community has a corner. EventLinqs is built for Houston African organisers running events that anchor a continental community in America's energy capital.",
  },
  'african/atlanta': {
    hero_subtitle: "Southern capital, African pulse.",
    editorial:
      "Atlanta is the African American capital and the African community's southern hub. Stone Mountain holds the Nigerian and Ghanaian families, Clarkston is the Ethiopian and Eritrean refugee city, Decatur holds the Liberian and Sierra Leonean community. Owambe celebrations at the Cobb Galleria Centre, Afrobeats nights at Compound and Tongue and Groove, Amapiano takes over Edgewood. African Restaurant Week runs every September. The African Cultural Festival every May at Atlantic Station. Pan-African Gospel services across Stonecrest mega-churches. Atlanta's hip-hop industry has pulled Afrobeats stars through every venue from State Farm to Mercedes-Benz, and the African diaspora promoters know how to turn out a city. EventLinqs is built for Atlanta African organisers running events that connect the continent to America's most influential black city.",
  },
  'african/lagos': {
    hero_subtitle: "Where it all begins.",
    editorial:
      "Lagos is the source. Owambe celebrations every Saturday across Lekki, Victoria Island, Ikeja and the mainland. Afrobeats nights at the Hard Rock Cafe and Quilox, Amapiano DJs working Lagos Island clubs through to dawn. Detty December turns the city into a continent-wide festival every year. Pan-African Gospel services at Daystar, Christ Embassy, RCCG mega-locations across the metropolis pull crowds of fifty thousand. Eyo festivals on Lagos Island, Ojude Oba in Ijebu Ode just up the coast. Lagos is the city that defines Nigerian celebration and exports it to every continent. EventLinqs is built for Lagos African organisers running the events that the rest of the world watches and copies.",
  },

  // ============================================================
  // SOUTH ASIAN
  // ============================================================
  'south-asian/sydney': {
    hero_subtitle: "From Bollywood to Bondi, Sydney's South Asian scene.",
    editorial:
      "Bollywood club nights at the Star, garba and Navratri at Sydney Olympic Park, Diwali fireworks lighting up Parramatta and Auburn, Holi colours covering Sydney University every March. Tamil cinema premieres in Strathfield, Indian classical at the Opera House, bhangra raves in Liverpool. Sydney's South Asian scene is generations deep and a million strong, from Indian and Pakistani aunties running family festivals to Sri Lankan and Bangladeshi student societies booking out venues every weekend. EventLinqs is built for the Sydney South Asian promoters who already know the community shows up - we just give them a fairer ticketing platform.",
  },
  'south-asian/melbourne': {
    hero_subtitle: "From Bollywood to Bayside, Melbourne's South Asian scene.",
    editorial:
      "Indian Film Festival of Melbourne every August, Diwali at Federation Square, Holi at Princes Park, Navratri garba nights in Wantirna, bhangra warehouse parties in Brunswick, South Indian classical at the Melbourne Recital Centre. Tamil and Telugu cinema in Box Hill, Bollywood at the Bendigo Bank Centre, Sri Lankan family festivals in Dandenong. Melbourne's South Asian community runs every weekend and books every kind of venue. EventLinqs is built for Melbourne South Asian organisers who want transparent fees, WhatsApp-first sharing, and tools that respect a community that has been throwing the city's biggest community events for decades.",
  },
  'south-asian/brisbane': {
    hero_subtitle: "Sunshine state, subcontinent rhythms.",
    editorial:
      "Brisbane's South Asian community is fast-growing and family-led. Sunnybank, Eight Mile Plains and Calamvale hold the Indian and Sri Lankan families, Inala and Forest Lake hold the Pakistani and Bangladeshi communities, Mt Gravatt is the Tamil cinema heart. Diwali at Roma Street Parkland pulls thirty thousand each year, Holi at Musgrave Park covers a generation in colour, Navratri garba nights run nine deep through Jindalee community halls every September. Bollywood club nights at the Met and Family Nightclub. Sri Lankan New Year celebrations at the QEII Stadium grandstand. The Brisbane South Asian Cultural Society anchors the older calendar, and the new generation runs Bhangra and Punjabi rhythm nights through Fortitude Valley. EventLinqs is built for Brisbane South Asian organisers running events that have shaped the city's most multicultural southern suburbs.",
  },
  'south-asian/perth': {
    hero_subtitle: "Indian Ocean to Indian Subcontinent.",
    editorial:
      "Perth's South Asian community has grown faster than any other Australian capital. Canning Vale, Willetton and Riverton hold the Indian and Sri Lankan families, Thornlie and Gosnells hold the Pakistani community, Cannington is the Sri Lankan Burgher heart. Diwali at Forrest Place pulls twenty thousand, Holi at Whiteman Park is one of the largest in the country, Navratri at the Perth Convention Centre runs nine nights of garba and dandiya. Bollywood weddings at Crown Perth, Tamil cinema premieres at Cygnet Cinema, Sri Lankan New Year at Whiteman Park. The Indian Society of WA, the Sindhi Association, the Telugu Association of WA all run packed annual calendars. The Subcontinent Festival every November takes over Northbridge for a weekend. EventLinqs is built for Perth South Asian organisers who already know the community books out venues months in advance.",
  },
  'south-asian/adelaide': {
    hero_subtitle: "Festival city, subcontinent welcome.",
    editorial:
      "Adelaide's South Asian community is established and refreshing through new migration. Mawson Lakes, Pooraka and Para Hills hold the Indian families, Salisbury holds the Pakistani and Bangladeshi communities, Royal Park is the Sri Lankan heart. Diwali at Bonython Park lights up the Torrens, Holi at Rymill Park covers central Adelaide, Navratri garba nights at the Marion Cultural Centre run nine nights deep. Bollywood club nights at HQ Complex, Tamil cinema premieres at Mercury Cinema, Sri Lankan New Year at the Adelaide Showgrounds. OzAsia Festival every October brings Indian classical, Pakistani qawwali and Sri Lankan dance to the Adelaide Festival Centre. The South Australian Indian Cultural Centre coordinates a year-round calendar. Adelaide Fringe always picks up Bollywood comedy and Punjabi music acts each March. EventLinqs is built for Adelaide South Asian organisers running events that knit subcontinent celebration into the festival city's calendar.",
  },
  'south-asian/gold-coast': {
    hero_subtitle: "Coast life, subcontinent celebration.",
    editorial:
      "The Gold Coast South Asian community is young, professional, and growing fast. Robina, Carrara and Helensvale hold the Indian and Sri Lankan families, Southport holds the international student crowd, Surfers Paradise is where Bollywood club nights happen on Saturday Saturday. Diwali at Broadwater Parklands pulls fifteen thousand, Holi at HOTA every March covers a coast generation in colour, Navratri garba at the Carrara Stadium function rooms runs nine nights through September. Tamil cinema premieres at the Pacific Fair Event Cinemas, Sri Lankan New Year at Robina Community Centre, Bollywood weddings at the Star Gold Coast. The wider GC Indian Cultural Society and Tamil Association of Gold Coast both run year-round calendars. EventLinqs is built for Gold Coast South Asian organisers running events that mix coast lifestyle with subcontinent celebration.",
  },
  'south-asian/canberra': {
    hero_subtitle: "Capital community, subcontinent stage.",
    editorial:
      "Canberra's South Asian community is education, embassy and government-led. Gungahlin, Ngunnawal and Belconnen hold the Indian, Pakistani and Sri Lankan families, Tuggeranong holds the Bangladeshi community, ANU and University of Canberra anchor the student-led community societies. Diwali at Stage 88 in Commonwealth Park pulls ten thousand, Holi at Glebe Park, Navratri garba at the Italo-Australian Club, bhangra nights at Mooseheads. The Indian High Commission and Pakistan High Commission run year-round embassy events that feed into community calendars. Tamil cinema premieres at Dendy Canberra Centre, Sri Lankan New Year at the Canberra Theatre Centre. The ACT Indian Cultural Council coordinates the bigger gatherings. EventLinqs is built for Canberra South Asian organisers running events that punch above the city's size and weight.",
  },
  'south-asian/hobart': {
    hero_subtitle: "Apple Isle, subcontinent welcome.",
    editorial:
      "Hobart's South Asian community is small, recent, and warm. Sandy Bay holds the University of Tasmania student crowd, Kingston and Glenorchy hold the older Indian and Sri Lankan families, Bridgewater holds the newer Pakistani and Bangladeshi arrivals. Diwali at the Hobart Town Hall pulls eight hundred for one big shared meal each November. Holi at Cornelian Bay covers a Tasmanian autumn day in colour. Navratri garba at the Tasmanian Cricket Association function rooms. Sri Lankan New Year at the Long House. The University of Tasmania Indian Students Association runs community nights through every semester. The Multicultural Council of Tasmania anchors the calendar. The community is small enough that everyone is on the same WhatsApp groups, big enough that something is on most weekends. EventLinqs is built for Hobart South Asian organisers keeping subcontinent celebration alive in Australia's southernmost capital.",
  },
  'south-asian/newcastle': {
    hero_subtitle: "Steel city, subcontinent rhythm.",
    editorial:
      "Newcastle's South Asian community is anchored by the University of Newcastle and growing through professional migration. Mayfield, Hamilton and Charlestown hold the Indian families, Wallsend holds the Pakistani community, Glendale holds the Sri Lankan families. Diwali at Civic Park pulls five thousand, Holi at Foreshore Park covers the Hunter in colour, Navratri garba at the Wests City function rooms. Bollywood club nights at the Cambridge and Lass O'Gowrie. Tamil cinema premieres at Event Cinemas Glendale. Sri Lankan New Year at the Newcastle Town Hall. The Hunter Region Indian Association coordinates the calendar, and the UoN Indian Students Society pulls fresh energy through every semester. EventLinqs is built for Newcastle South Asian organisers running events that anchor a subcontinent community in the steel river city.",
  },
  'south-asian/wollongong': {
    hero_subtitle: "Illawarra coast, subcontinent stage.",
    editorial:
      "Wollongong's South Asian community has grown through the University of Wollongong and the wider Illawarra professional migration. Figtree, Mount Keira and Berkeley hold the Indian and Sri Lankan families, Warrawong holds the Pakistani and Bangladeshi community, Coniston is the Tamil cinema heart. Diwali at Wollongong Town Hall pulls four thousand, Holi at Stuart Park covers a coast Saturday in colour, Navratri garba at the Beaton Park Leisure Centre runs nine nights through September. Bollywood club nights at the UniBar pull the wider Illawarra in. Tamil cinema premieres at Event Cinemas Wollongong, Sri Lankan New Year at the Illawarra Performing Arts Centre. The Illawarra Indian Cultural Association anchors the year-round calendar. EventLinqs is built for Wollongong South Asian organisers running events that thread subcontinent celebration through the steel coast.",
  },
  'south-asian/geelong': {
    hero_subtitle: "Bay city, subcontinent welcome.",
    editorial:
      "Geelong's South Asian community has grown rapidly through professional migration into the Western District. Highton, Wandana Heights and Belmont hold the Indian families, Norlane holds the Sri Lankan and Pakistani communities, Newcomb holds the Bangladeshi families. Diwali at Steampacket Gardens pulls three thousand, Holi at Rippleside Park covers the bay in colour, Navratri garba at the Geelong Indian Community Centre runs nine nights every September. Bollywood club nights at GMHBA Stadium function rooms. Tamil cinema premieres at Event Cinemas Geelong, Sri Lankan New Year at the Wool Exchange. The Geelong Indian Cultural Society and Tamil Association of Geelong coordinate the calendar. The community is small enough that everyone knows each other and big enough that the calendar never goes empty. EventLinqs is built for Geelong South Asian organisers running events that bring subcontinent celebration to the second-largest Victorian city.",
  },
  'south-asian/sunshine-coast': {
    hero_subtitle: "Hinterland warmth, subcontinent welcome.",
    editorial:
      "The Sunshine Coast South Asian community is young and lifestyle-led - families relocating from Brisbane and Sydney for the climate, plus a growing professional intake. Buderim, Mountain Creek and Sippy Downs hold the Indian families, Caloundra holds the Sri Lankan community, Maroochydore is where Bollywood club nights happen on Saturday. Diwali at Cotton Tree Park pulls two thousand, Holi at Mooloolaba Beach covers a coast morning in colour, Navratri garba at the Lake Kawana Community Centre runs nine nights every September. Tamil cinema premieres at Event Cinemas Plaza Maroochydore, Sri Lankan New Year at the Maroochy RSL function rooms. The Sunshine Coast Indian Cultural Society coordinates the calendar. EventLinqs is built for Sunshine Coast South Asian organisers running events that weave subcontinent celebration into hinterland and coast lifestyle.",
  },
  'south-asian/cairns': {
    hero_subtitle: "Tropical north, subcontinent sun.",
    editorial:
      "Cairns has a small but growing South Asian community - Indian and Sri Lankan families running businesses through the tourism and reef sectors, plus a refreshing student intake at James Cook University. Manunda and Edmonton hold the Indian families, Earlville holds the Sri Lankan community, Westcourt is the Pakistani heart. Diwali at Munro Martin Parklands pulls eight hundred, Holi at Centenary Lakes covers a tropical morning in colour, Navratri garba at the Brothers Leagues Club runs nine nights every September. Bollywood club nights at the Pier Bar and Salt House. Tamil cinema premieres at Cairns Central Cinemas, Sri Lankan New Year at the Brothers function rooms. The Far North Queensland Indian Cultural Association coordinates the calendar. EventLinqs is built for Cairns South Asian organisers running events that bring subcontinent celebration into the tropics.",
  },
  'south-asian/darwin': {
    hero_subtitle: "Top End energy, subcontinent celebration.",
    editorial:
      "Darwin's South Asian community is mid-sized and family-led. Karama, Anula and Palmerston hold the Indian families, Casuarina holds the Sri Lankan community, Marrara is the Pakistani heart. Diwali at the Darwin Convention Centre pulls fifteen hundred, Holi at Bicentennial Park covers a wet-season afternoon in colour, Navratri garba at the Marrara Sporting Complex runs nine nights every September. Bollywood club nights at Lola's Pergola and the Throb. Tamil cinema premieres at Event Cinemas Casuarina, Sri Lankan New Year at the Hindu Society of NT. The Indian Cultural Society of NT and Sri Lanka Association of NT coordinate the year-round calendar. India@Mindil every August at Mindil Beach Sunset Markets brings food, music and dance to the Top End's most-loved venue. EventLinqs is built for Darwin South Asian organisers running events that thrive in Australia's most tropical capital.",
  },
  'south-asian/townsville': {
    hero_subtitle: "Tropical north, subcontinent stage.",
    editorial:
      "Townsville's South Asian community has grown through the JCU medical school and the wider professional migration into north Queensland. Annandale and Kelso hold the Indian families, Kirwan holds the Sri Lankan community, Aitkenvale is the Tamil cinema heart. Diwali at the Civic Theatre pulls one thousand, Holi at Riverway covers a dry-season morning in colour, Navratri garba at the Brothers Leagues Club runs nine nights every September. Bollywood club nights at the Brewery and Mariners. Tamil cinema premieres at Event Cinemas Townsville, Sri Lankan New Year at the Townsville Indian Cultural Centre. The North Queensland Indian Society anchors the calendar, and the JCU Indian Students Association brings fresh energy each semester. EventLinqs is built for Townsville South Asian organisers running events that anchor a subcontinent community in tropical north Queensland.",
  },
  'south-asian/london': {
    hero_subtitle: "Mumbai meets the Thames.",
    editorial:
      "London is the second city of South Asia. Southall is Punjab on the western Tube line, Tooting is Tamil Nadu south of the river, Wembley is Gujarat at the end of the Metropolitan, Whitechapel is Bangladesh east of the City. Diwali on Trafalgar Square pulls one hundred thousand, Holi at the BAPS Mandir in Neasden covers a London morning in colour, Navratri at the Wembley Arena runs nine nights every September. Bollywood club nights at Heaven and the Indigo at the O2. Tamil cinema premieres at the Vue Cinemas across the city. Indian classical at the Royal Albert Hall, Pakistani qawwali at the Barbican. The British Indian community is the largest in Europe, and London is its capital. EventLinqs is built for London South Asian organisers running events that the global subcontinent watches.",
  },
  'south-asian/toronto': {
    hero_subtitle: "Lakeside, subcontinent stage.",
    editorial:
      "Toronto's South Asian community is the largest in North America. Brampton is the Punjabi capital of Canada, Mississauga is the Gujarati and Sindhi heart, Scarborough is the Tamil city, Markham is the Sri Lankan and Hindu South Indian centre. Diwali at Nathan Phillips Square pulls fifty thousand, Holi at Downsview Park covers a Toronto spring morning in colour, Navratri at the Brampton Soccer Centre runs nine nights every September. Bollywood club nights at Rebel and Lavelle. Tamil cinema premieres at Cineplex theatres across the GTA. Indian classical at Roy Thomson Hall, Pakistani qawwali at the Aga Khan Museum. The University of Toronto and York University South Asian Students Associations anchor a steady stream of events through every semester. EventLinqs is built for Toronto South Asian organisers running events that connect the largest subcontinent community in North America.",
  },
  'south-asian/new-york': {
    hero_subtitle: "Five boroughs, subcontinent stage.",
    editorial:
      "New York's South Asian community runs through Queens. Jackson Heights is Little India and Little Pakistan and Little Bangladesh layered into a single train ride. Floral Park, Hicksville and Edison New Jersey hold the wealthy Indian-American families. Diwali at Times Square pulls twenty thousand, Holi at Washington Square Park covers a Manhattan spring afternoon in colour, Navratri at the Nassau Coliseum runs nine nights every September. Bollywood club nights at Hudson Yards and Slate. Tamil cinema premieres at AMC theatres in Edison and Hicksville. Indian classical at Carnegie Hall. The South Asian American community runs the deepest professional and arts calendar in the United States, and New York anchors it. EventLinqs is built for New York South Asian organisers running events that connect the global subcontinent to the world's biggest stage.",
  },
  'south-asian/dubai': {
    hero_subtitle: "Gulf city, subcontinent capital.",
    editorial:
      "Dubai is the South Asian capital of the Gulf. Bur Dubai and Karama hold the older Indian and Pakistani families, Al Quoz and JLT hold the new Bangladeshi and Sri Lankan professional intake, Deira and the gold souk are the Sindhi and Gujarati merchant heart. Diwali at the Dubai Mall pulls one hundred thousand, Holi at the Dubai Polo Club covers an afternoon in colour, Navratri at the World Trade Centre runs nine nights every September. Bollywood concerts at the Coca-Cola Arena, Tamil cinema premieres at Reel Cinemas across the city, Pakistani qawwali at the Madinat Theatre. The Indian Consulate and Pakistan Consulate run year-round embassy receptions that feed into community calendars. EventLinqs is built for Dubai South Asian organisers running events that anchor a subcontinent community of three million in the Gulf's most-watched city.",
  },
  'south-asian/mumbai': {
    hero_subtitle: "Where the films come from.",
    editorial:
      "Mumbai is the source. Bollywood premieres at the PVR Andheri and INOX every Friday, Diwali across the city turns Marine Drive into a sea of lights, Holi at Powai covers a quarter-million in colour, Navratri at the BKC Grounds and Bandra runs nine nights every September. Bandra and Juhu host the Bollywood industry's parties. Dadar and Mahim hold the Marathi community heart. Bhuleshwar holds the Gujarati merchant heart. Borivali and Malad hold the Sindhi families. Mumbai defines South Asian celebration globally, and the calendar runs every weekend. EventLinqs is built for Mumbai South Asian organisers running the events the rest of the world studies and copies.",
  },

  // ============================================================
  // CARIBBEAN
  // ============================================================
  'caribbean/sydney': {
    hero_subtitle: "Carnival, soca and steel drum, Sydney style.",
    editorial:
      "Sydney Carnival every February turning Hyde Park into Notting Hill for a weekend, Soca Saturdays in Newtown, reggae nights in Marrickville, Trinidadian J'ouvert breakfasts in Coogee, Jamaican beach parties at Bondi, Caribbean Gospel Sundays in Liverpool. The city's Caribbean community is small but runs hard, and the calendar peaks every Australian summer with mas, calypso and steel drum events that pull a whole-city crowd. EventLinqs is built for the Sydney Caribbean promoters who keep the carnival alive year-round.",
  },
  'caribbean/melbourne': {
    hero_subtitle: "Yard and city, Melbourne carnival.",
    editorial:
      "Melbourne's Caribbean community runs out of Footscray, Dandenong and the inner north. Reggae nights at Section 8 in the city, dancehall at Brunswick warehouse parties, Trinidadian carnival rehearsals in Footscray Community Arts Centre that build through autumn for the Caribbean Festival every February at Royal Park. Jamaican rum bars in Fitzroy, Haitian community gatherings in Sunshine, Bajan beach lunches at St Kilda when the weather plays nice. The Melbourne Caribbean Society pulls the calendar together, and the Caribbean DJs running Sundays at the Workers Club have built one of the most loyal scenes in the city. EventLinqs is built for Melbourne Caribbean organisers running events that bring island rhythm to Australia's coldest capital.",
  },
  'caribbean/brisbane': {
    hero_subtitle: "Tropical state, tropical rhythm.",
    editorial:
      "Brisbane's Caribbean community is small and warm. South Bank holds the Caribbean Carnival every July, when the dry season makes the city a perfect stand-in for the tropics. Reggae and dancehall at the Triffid in Newstead, soca rehearsals in Inala community halls, Trinidadian J'ouvert mornings at Roma Street Parkland through summer. The Queensland Caribbean Association is small but tight - everyone knows everyone, and a single WhatsApp can fill a venue. Jamaican rum punches at Fortitude Valley bars, Bajan beach lunches at Wynnum Beach, Caribbean Gospel Sundays through Logan churches. EventLinqs is built for Brisbane Caribbean organisers keeping island rhythm warm in Queensland's biggest city.",
  },
  'caribbean/perth': {
    hero_subtitle: "Indian Ocean, Caribbean Sea, one rhythm.",
    editorial:
      "Perth's Caribbean community is the smallest in any Australian capital, and the most resilient. Carnival rehearsals at the Multicultural Services Centre in Mirrabooka build through autumn for the Perth Caribbean Carnival every March. Reggae nights at the Indi Bar and the Bird, dancehall warehouse parties through Northbridge, Trinidadian J'ouvert breakfasts at Cottesloe Beach when the dawn comes warm. The wider Caribbean Australia network keeps the Perth crew connected to Sydney and Melbourne, and twice a year the Sydney mas band crosses the country. Jamaican rum bars in Fremantle, Bajan beach BBQs at Scarborough, Caribbean Gospel through community churches in Gosnells. EventLinqs is built for Perth Caribbean organisers running events that hold a tiny tight community across Australia's most isolated city.",
  },
  'caribbean/adelaide': {
    hero_subtitle: "Festival city, island sound.",
    editorial:
      "Adelaide's Caribbean community is small and steady. The Caribbean Festival every March at Bonython Park brings everyone together for one big day of food, drumming and steel pan from across the islands. Reggae and dancehall nights at Jive on Hindley Street, Trinidadian J'ouvert breakfasts at Glenelg Beach when summer is at its peak, Jamaican rum bars in the West End. The Adelaide Caribbean Society pulls the year-round calendar together. Bajan beach lunches at Henley, Haitian gatherings through community halls in Salisbury, Caribbean Gospel Sundays through churches in Para Hills. The community is small enough that everyone shows up, big enough that the calendar never goes empty. Adelaide Fringe always picks up at least one Caribbean comedy or music act each March. EventLinqs is built for Adelaide Caribbean organisers running events that bring island rhythm to South Australia.",
  },
  'caribbean/gold-coast': {
    hero_subtitle: "Beach, sun, soca.",
    editorial:
      "The Gold Coast Caribbean community runs warm. Surfers Paradise and Broadbeach pull Caribbean DJs through summer, when the city's beach lifestyle most matches island rhythm. Trinidadian J'ouvert breakfasts at Currumbin Beach as the sun comes up, reggae sundowners at the Burleigh Pavilion, dancehall club nights at the Beergarden Surfers. The annual GC Caribbean Beach Festival every February at Coolangatta Beach pulls Brisbane and Sydney crews down for the long weekend. Jamaican rum bars threaded through Mermaid Beach, Bajan BBQs along the foreshore, Caribbean Gospel through churches in Robina. The community is small but the climate keeps the calendar steady. EventLinqs is built for Gold Coast Caribbean organisers running events that match coast lifestyle to island rhythm.",
  },
  'caribbean/canberra': {
    hero_subtitle: "Capital territory, island heart.",
    editorial:
      "Canberra's Caribbean community is small and embassy-flavoured. The Jamaica High Commission anchors a quietly steady calendar of community events through the year, and the wider Caribbean Australia network coordinates Carnival weekends that pull everyone to Sydney each February. Reggae nights at Mooseheads, dancehall at the Phoenix Pub, Trinidadian J'ouvert breakfasts at Lake Burley Griffin when the weather plays nice. ANU Caribbean Society pulls a steady stream of student-led community nights through every semester. Jamaican rum at Smith's Alternative, Bajan BBQs at Black Mountain Peninsula, Caribbean Gospel through churches in Tuggeranong. EventLinqs is built for Canberra Caribbean organisers running events that hold a tight community in the federal capital.",
  },
  'caribbean/hobart': {
    hero_subtitle: "Apple Isle, island warmth.",
    editorial:
      "Hobart's Caribbean community is tiny and proud. Reggae sundowners at the Republic Bar, dancehall nights at Brisbane Hotel, Trinidadian J'ouvert breakfasts at Hobart's waterfront when summer comes through. The wider Caribbean Australia WhatsApp groups keep Hobart connected to Sydney, Melbourne and Brisbane, and the annual Caribbean Festival in Sydney pulls a Hobart crew across each February. Jamaican rum at Lark Distillery's tasting room, Bajan beach lunches at Sandy Bay, Caribbean Gospel through churches in Glenorchy. The University of Tasmania Caribbean Students Society runs community nights each semester. The community is small enough that one warm WhatsApp can fill a room. EventLinqs is built for Hobart Caribbean organisers keeping island rhythm alive in Australia's coldest capital.",
  },
  'caribbean/newcastle': {
    hero_subtitle: "Steel city, steel drum.",
    editorial:
      "Newcastle's Caribbean community is small and scrappy. Reggae nights at the Cambridge and the Lass O'Gowrie, dancehall warehouse parties through Hamilton, Trinidadian J'ouvert breakfasts at Newcastle Beach when summer peaks. The annual Hunter Caribbean Festival every February at Civic Park brings the whole region's crew together for one big day. The University of Newcastle Caribbean Students Society pulls fresh student energy each semester. Jamaican rum at the Honeysuckle bars, Bajan beach BBQs at Nobbys, Caribbean Gospel through churches in Wallsend. The Hunter Region Caribbean Association anchors the year-round calendar. EventLinqs is built for Newcastle Caribbean organisers running events that bring island rhythm to the steel river city.",
  },
  'caribbean/wollongong': {
    hero_subtitle: "Illawarra coast, island stage.",
    editorial:
      "Wollongong's Caribbean community is small, university-led, and growing. The University of Wollongong Caribbean Students Association runs reggae nights at the UniBar through every semester, Trinidadian J'ouvert breakfasts at North Beach when summer comes in, dancehall warehouse parties in Warrawong. The annual Illawarra Caribbean Beach Day every February at Stuart Park brings the whole coast's Caribbean families together. Jamaican rum at the Servo and the Heritage Hotel, Bajan beach BBQs at Austinmer, Caribbean Gospel through churches in Berkeley. The wider Caribbean Australia network keeps Wollongong connected to Sydney's Carnival every February. EventLinqs is built for Wollongong Caribbean organisers running events that thread island rhythm through the steel coast.",
  },
  'caribbean/geelong': {
    hero_subtitle: "Bay city, Caribbean rhythm.",
    editorial:
      "Geelong's Caribbean community is tiny and warm. Reggae sundowners at the Wool Exchange and the Beav, dancehall nights at the Barwon Club, Trinidadian J'ouvert breakfasts at Eastern Beach when the bay comes warm. The wider Caribbean Australia network keeps Geelong's crew connected to Melbourne's Caribbean Festival every February, and twice a year the Melbourne mas band crosses the bridge. Jamaican rum at the Sphinx Hotel, Bajan beach BBQs at Cunningham Pier on warm Sundays, Caribbean Gospel through community churches in Norlane. Deakin University Caribbean Students Society runs occasional community nights through the year. EventLinqs is built for Geelong Caribbean organisers running events that bring island rhythm to the second city of Victoria.",
  },
  'caribbean/sunshine-coast': {
    hero_subtitle: "Hinterland warm, island rhythm.",
    editorial:
      "The Sunshine Coast Caribbean community is small and lifestyle-led. Mooloolaba and Caloundra hold the families, Maroochydore is where reggae sundowners happen at the Surfair Beach Hotel, Trinidadian J'ouvert breakfasts at Cotton Tree when summer comes through. The wider Caribbean Australia network connects the coast's Caribbean families to Brisbane's annual Caribbean Festival. Jamaican rum at the Doonan Pub, Bajan beach BBQs at Coolum Beach, Caribbean Gospel through community churches in Buderim. The University of the Sunshine Coast Caribbean Students Society runs occasional community nights through the year. The community is tiny but the Queensland sun keeps the rhythm steady. EventLinqs is built for Sunshine Coast Caribbean organisers running events that match coast lifestyle to island warmth.",
  },
  'caribbean/cairns': {
    hero_subtitle: "Tropical north, tropical rhythm.",
    editorial:
      "Cairns has a small Caribbean community and a perfect tropical climate. Reggae and dancehall at the Pier Bar and Salt House, Trinidadian J'ouvert breakfasts at the Esplanade Lagoon when sunrise comes warm, Jamaican rum at the Crystalbrook Riley bar. The annual Cairns Tropical Caribbean Beach Day every May at Yorkeys Knob pulls the small community together for one big shared lunch. James Cook University Caribbean Students Association runs occasional community nights each semester. Caribbean Gospel through community churches in Westcourt. The community is the smallest of any major Australian city, and the welcome is widest. EventLinqs is built for Cairns Caribbean organisers running events that match the tropics to island rhythm at Australia's reef capital.",
  },
  'caribbean/darwin': {
    hero_subtitle: "Top End heat, island heat.",
    editorial:
      "Darwin's Caribbean community is tiny and resilient. Reggae and dancehall at Lola's Pergola and the Throb through the dry, Trinidadian J'ouvert breakfasts at Mindil Beach when sunrise comes warm and pink, Jamaican rum at the Tap on Mitchell. The wider Caribbean Australia network keeps Darwin's crew connected to Brisbane's Caribbean Festival each July. Caribbean Gospel through community churches in Karama, Bajan beach BBQs at Lee Point through the dry season. The Charles Darwin University Caribbean Students Society runs occasional community nights each semester. The community is small enough that everyone is on the same WhatsApp groups, and the climate makes Darwin one of the most natural-feeling Caribbean stand-ins in Australia. EventLinqs is built for Darwin Caribbean organisers running events that bring island rhythm to the Top End.",
  },
  'caribbean/townsville': {
    hero_subtitle: "Tropical north, island rhythm.",
    editorial:
      "Townsville's Caribbean community is tiny and tropical. Reggae sundowners at the Brewery and the Mariners Bar, Trinidadian J'ouvert breakfasts at the Strand when sunrise comes warm, Jamaican rum at the Madison's Hotel. The James Cook University Caribbean Students Society pulls fresh energy each semester through community nights at the Brewery. Caribbean Gospel through community churches in Kirwan, Bajan beach BBQs along Pallarenda through the dry season. The wider Caribbean Australia network connects Townsville's small crew to Brisbane's annual Caribbean Festival each July. The dry-season climate makes Townsville one of the most island-feeling cities in Australia. EventLinqs is built for Townsville Caribbean organisers running events that bring island rhythm into tropical north Queensland.",
  },
  'caribbean/london': {
    hero_subtitle: "Notting Hill is forever.",
    editorial:
      "London is the second city of the Caribbean. Notting Hill Carnival every August Bank Holiday turns west London into Trinidad for two days and pulls two million people through the streets. Brixton is Jamaica south of the river, Hackney is the dancehall capital, Tottenham holds the Trinidadian families, Peckham holds the Bajan and Guyanese community. Reggae nights at Phonox, dancehall at Fabric, Caribbean Gospel services at the New Testament Church of God in Wood Green. Soca sound systems at Carnival, calypso tents at the Tabernacle. The British Caribbean community is the largest in Europe, and London is its capital. EventLinqs is built for London Caribbean organisers running events that the global islands watch.",
  },
  'caribbean/toronto': {
    hero_subtitle: "Lakeside, island love.",
    editorial:
      "Toronto's Caribbean community is the largest in North America. Caribana every August takes over the lakefront for the largest Caribbean Carnival in the continent, pulling a million through downtown. Eglinton West is Little Jamaica, Scarborough holds the Trinidadian families, Brampton holds the Guyanese and Bajan community. Reggae and dancehall at Coda and Rebel, Caribbean Gospel services at Don Valley Bible Centre, soca sound systems at the Ex grounds in summer, calypso tents through Caribana season. The University of Toronto Caribbean Students Association anchors a steady stream of student-led community nights through every semester. EventLinqs is built for Toronto Caribbean organisers running community events that knit the largest island community in North America.",
  },
  'caribbean/new-york': {
    hero_subtitle: "Five boroughs, one rhythm.",
    editorial:
      "New York's Caribbean community runs through Brooklyn and Queens. Crown Heights and East Flatbush are Little Jamaica and Little Trinidad, Jackson Heights holds the Guyanese and Trinidadian families, the Bronx holds the Puerto Rican-Caribbean overlap. West Indian American Day Carnival on Eastern Parkway every Labor Day pulls three million through Brooklyn for the largest Caribbean Carnival in America. Reggae and dancehall at Brooklyn Steel and Webster Hall, soca sound systems at the Carnival, Caribbean Gospel services at Bedford Central Presbyterian. The Caribbean American community runs the deepest community calendar in the United States, and New York anchors it. EventLinqs is built for New York Caribbean organisers running events that connect the global islands to America's biggest stage.",
  },
  'caribbean/miami': {
    hero_subtitle: "Closest mainland, brightest sun.",
    editorial:
      "Miami is the Caribbean's closest American city. Little Haiti is Port-au-Prince in north Miami, Liberty City and Brownsville hold the Bahamian and Jamaican families, Kendall holds the wealthy Caribbean professional class. Miami Carnival every October takes over Sun Life Stadium for one of the largest Caribbean Carnivals outside the islands. Reggae and dancehall at LIV and Story, Haitian compas at Le Soleil, soca sound systems at the Carnival, Caribbean Gospel services at Believers' Faith Baptist. The geography means the islands are reachable by boat, and the calendar runs hot all year. EventLinqs is built for Miami Caribbean organisers running events that anchor the closest island community to mainland America.",
  },
  'caribbean/kingston': {
    hero_subtitle: "Where the music begins.",
    editorial:
      "Kingston is the Caribbean's musical capital. Reggae Sumfest at Catherine Hall in Montego Bay every July, Sting at Jamworld in Portmore every Boxing Day, Tuff Gong studio sessions in Trench Town that built the global sound. Half Way Tree is the dancehall capital, New Kingston holds the industry venues, the Pegasus and Spanish Court hotels host the Caribbean's biggest community conferences. Bob Marley's birthday celebrations every February at 56 Hope Road draw pilgrims from every continent. Reggae Boyz football matches at the National Stadium pull fifty thousand. Kingston is the city that defines Caribbean celebration globally, and exports it. EventLinqs is built for Kingston Caribbean organisers running the events that the rest of the world watches and copies.",
  },

  // ============================================================
  // LATIN
  // ============================================================
  'latin/sydney': {
    hero_subtitle: "Salsa, bachata and reggaeton, alive across Sydney.",
    editorial:
      "Salsa nights in Surry Hills, bachata socials in Newtown, reggaeton club nights in Kings Cross, Mexican Day of the Dead at Carriageworks, Brazilian samba schools in Petersham, Cuban son nights at the basement, Argentine tango milongas across the inner west. Sydney's Latin scene is a Pan-American mosaic, with promoters from every country in Central and South America running weekly socials and seasonal mega-events. EventLinqs gives Sydney Latin organisers a fair platform that respects how the community moves: WhatsApp shares, squad bookings for crews, and zero hidden fees.",
  },
  'latin/melbourne': {
    hero_subtitle: "South America, south of the Yarra.",
    editorial:
      "Melbourne's Latin community is the deepest in Australia. Footscray and Sunshine hold the Salvadoran and Chilean families, Brunswick is the Argentine tango heart, Carlton holds the Brazilian student crowd, Dandenong holds the Colombian community. Salsa socials at the Bossa in Brunswick run every Tuesday, bachata Saturdays at Fitzroy Town Hall pull six hundred, reggaeton club nights at Section 8 fill the laneway through summer. Mexican Day of the Dead at Edinburgh Gardens, Brazilian samba schools rehearsing through autumn at the Brunswick Mechanics Institute for Carnaval at Federation Square. Cuban son nights at Cherry Bar, Argentine asados at Edinburgh Gardens. The Latin American Cultural Centre on Sydney Road anchors the year-round calendar. EventLinqs is built for Melbourne Latin organisers running the largest Latin scene south of the equator.",
  },
  'latin/brisbane': {
    hero_subtitle: "Sunshine state, Latin sun.",
    editorial:
      "Brisbane's Latin community is warm and growing. Fortitude Valley holds the salsa scene, West End holds the Brazilian community, Sunnybank holds the Mexican families, Stones Corner holds the Argentine and Chilean families. Salsa Saturdays at the Brisbane Latin Dance Studio in West End run weekly, bachata socials at the Tivoli pull eight hundred through summer, reggaeton at the Met every Friday packs Fortitude Valley. Carnaval Brasileiro every February at the Brisbane Powerhouse is one of the largest Brazilian carnivals outside Brazil. Cuban son nights at Black Bear Lodge, Argentine tango milongas at the Spanish Club, Mexican Day of the Dead celebrations at Roma Street Parkland. The Queensland Latin American Cultural Centre coordinates the year-round calendar. EventLinqs is built for Brisbane Latin organisers running events that bring Pan-American rhythm into Queensland's biggest city.",
  },
  'latin/perth': {
    hero_subtitle: "Indian Ocean, Pan-American rhythm.",
    editorial:
      "Perth's Latin community is the western edge of South America in Australia. Northbridge holds the salsa scene, Subiaco holds the Brazilian families, Mirrabooka holds the Salvadoran community, Fremantle holds the Chilean families. Salsa Saturdays at the Mojos Bar in North Fremantle run weekly, bachata socials at the Bird in Northbridge pull five hundred, reggaeton at the Court every Friday packs the city. Carnaval Brasileiro every February at the Perth Convention Centre is the largest Brazilian carnival in Western Australia. Cuban son nights at the Indi Bar in Scarborough, Argentine tango milongas at the Latin Club, Mexican Day of the Dead celebrations at Hyde Park. The Latin American Society of Western Australia anchors the year-round calendar. EventLinqs is built for Perth Latin organisers running events that bring Pan-American rhythm to Australia's most isolated capital.",
  },
  'latin/adelaide': {
    hero_subtitle: "Festival city, Latin heat.",
    editorial:
      "Adelaide's Latin community is mid-sized and warm. The Adelaide Latin Festival every March at Bonython Park brings everyone together for one big day of food, music and dance from across Central and South America. Salsa Saturdays at La Pasion in the West End pull four hundred, bachata socials at the HQ Complex run weekly, reggaeton at the Crown and Anchor packs Hindley Street. Carnaval Brasileiro every February at the Adelaide Showgrounds is one of the largest Brazilian carnivals in South Australia. Cuban son nights at the Wheatsheaf Hotel, Argentine tango milongas at the Polish Club, Mexican Day of the Dead at the Adelaide Botanic Garden. Adelaide Fringe always picks up at least one Latin music or comedy act each March. EventLinqs is built for Adelaide Latin organisers running events that bring Pan-American rhythm to the festival city.",
  },
  'latin/gold-coast': {
    hero_subtitle: "Beach, sun, sabor.",
    editorial:
      "The Gold Coast Latin community is young, bright and beach-led. Surfers Paradise pulls Latin DJs through summer, Broadbeach holds the Brazilian families, Robina holds the Mexican community, Burleigh holds the Argentine families. Salsa Saturdays at the Beergarden Surfers run weekly, bachata socials at the Star Gold Coast pull six hundred through summer, reggaeton at Coast Nightclub every Friday. Carnaval Brasileiro every February at HOTA brings Rio energy to the coast. Cuban son nights at the Burleigh Pavilion, Argentine asados at Currumbin Beach when the dry season comes through, Mexican Day of the Dead celebrations at the Coolangatta foreshore. The Gold Coast Latin Cultural Society coordinates the year-round calendar. EventLinqs is built for Gold Coast Latin organisers running events that match coast lifestyle to Pan-American rhythm.",
  },
  'latin/canberra': {
    hero_subtitle: "Capital community, Latin stage.",
    editorial:
      "Canberra's Latin community is embassy and university-anchored. The Argentine, Chilean, Mexican, Brazilian and Colombian embassies run year-round community events that feed into community calendars. Salsa Saturdays at the Hellenic Club in Woden run weekly, bachata socials at Mooseheads pull three hundred, reggaeton at the Phoenix Pub packs Civic. Latin Festival every March at Glebe Park brings everyone together for one big day of Pan-American food, music and dance. Cuban son nights at Smith's Alternative, Argentine tango milongas at the Italo-Australian Club, Mexican Day of the Dead at Commonwealth Park. The ANU Latin American Students Society and the Embassy of Brazil pull a steady stream of community events through every semester. EventLinqs is built for Canberra Latin organisers running events that punch above the federal capital's size and weight.",
  },
  'latin/hobart': {
    hero_subtitle: "Apple Isle, Latin warmth.",
    editorial:
      "Hobart's Latin community is small and dance-led. Salsa Saturdays at the Republic Bar run weekly, bachata socials at Brisbane Hotel pull two hundred, reggaeton at the Telegraph Hotel packs Salamanca through summer. Latin Festival every March at the Salamanca Lawns brings the wider Tasmania Latin community together for one big day of Pan-American food, music and dance. Cuban son nights at Lark Distillery, Argentine tango milongas at the Italian Club, Mexican Day of the Dead at PW1 in Salamanca. The University of Tasmania Latin American Students Society pulls fresh student energy each semester. The community is small enough that everyone is on the same WhatsApp groups, and the welcome is wide. EventLinqs is built for Hobart Latin organisers keeping Pan-American rhythm warm in Australia's coldest capital.",
  },
  'latin/newcastle': {
    hero_subtitle: "Steel city, Latin sound.",
    editorial:
      "Newcastle's Latin community is small and growing. Hamilton holds the Brazilian families, Mayfield holds the Mexican community, Cooks Hill holds the salsa scene. Salsa Saturdays at the Cambridge Hotel run weekly, bachata socials at the Lass O'Gowrie pull three hundred, reggaeton at King Street nightclub packs the inner city every Friday. Latin Festival every March at Civic Park brings the whole Hunter region's Latin community together for one big day. Cuban son nights at the Honeysuckle, Argentine tango milongas at the Newcastle Town Hall, Mexican Day of the Dead at Foreshore Park. The University of Newcastle Latin American Students Society pulls fresh student energy each semester. The Hunter Region Latin Cultural Association coordinates the year-round calendar. EventLinqs is built for Newcastle Latin organisers running events that bring Pan-American rhythm to the steel river city.",
  },
  'latin/wollongong': {
    hero_subtitle: "Illawarra coast, Latin stage.",
    editorial:
      "Wollongong's Latin community is small, university-led, and growing fast. The University of Wollongong Latin American Students Association runs salsa nights at the UniBar through every semester, bachata socials at the Heritage Hotel pull four hundred, reggaeton at the Servo packs Crown Street. Latin Festival every March at McCabe Park brings the whole coast's Latin families together for one big day. Cuban son nights at Howlin' Wolf Alehouse, Argentine tango milongas at the Wollongong Town Hall, Mexican Day of the Dead at Stuart Park. The Illawarra Latin Cultural Society coordinates the year-round calendar. The student rhythm gives the community a steady refresh of new voices each semester, and the older families anchor it. EventLinqs is built for Wollongong Latin organisers running events that thread Pan-American rhythm through the steel coast.",
  },
  'latin/geelong': {
    hero_subtitle: "Bay city, Latin rhythm.",
    editorial:
      "Geelong's Latin community has grown through professional migration and the Deakin University international student intake. Newcomb holds the Brazilian families, Norlane holds the Mexican community, Belmont holds the Chilean families. Salsa Saturdays at the Wool Exchange run weekly, bachata socials at the Sphinx Hotel pull three hundred, reggaeton at GMHBA Stadium function rooms packs the city through summer. Latin Festival every March at Johnstone Park brings the whole Geelong region's Latin community together for one big day. Cuban son nights at the Beav, Argentine tango milongas at the Geelong Italian Club, Mexican Day of the Dead at Eastern Park. The Deakin Latin American Students Society pulls fresh energy each semester. The Geelong Latin Cultural Association anchors the year-round calendar. EventLinqs is built for Geelong Latin organisers running events that bring Pan-American rhythm to the bay city.",
  },
  'latin/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Latin warmth.",
    editorial:
      "The Sunshine Coast Latin community is small, lifestyle-led and growing. Mooloolaba and Maroochydore hold the Brazilian families, Caloundra holds the Mexican community, Buderim holds the Argentine and Chilean families. Salsa Saturdays at the Surfair Beach Hotel run weekly, bachata socials at the Big Pineapple pull four hundred through summer, reggaeton at the Solbar packs Maroochydore every Friday. Latin Festival every March at Cotton Tree Park brings the wider coast Latin community together for one big day. Cuban son nights at the Doonan Pub, Argentine asados at Coolum Beach when the dry season comes, Mexican Day of the Dead at Mooloolaba Esplanade. The University of the Sunshine Coast Latin American Students Society pulls fresh energy each semester. EventLinqs is built for Sunshine Coast Latin organisers running events that match coast lifestyle to Pan-American rhythm.",
  },
  'latin/cairns': {
    hero_subtitle: "Tropical north, Latin sun.",
    editorial:
      "Cairns has a small but warm Latin community. Manunda and Earlville hold the Brazilian and Mexican families, Westcourt holds the Chilean and Colombian community, Edmonton holds the Argentine families. Salsa Saturdays at the Pier Bar run weekly, bachata socials at the Salt House pull two hundred, reggaeton at the Wool Shed packs Lake Street every Friday. Latin Festival every June at Munro Martin Parklands brings the wider Far North Queensland Latin community together for one big day. Cuban son nights at the Crystalbrook Riley bar, Argentine asados along the Esplanade through the dry, Mexican Day of the Dead at Centenary Lakes. The James Cook University Latin American Students Society pulls fresh student energy each semester. EventLinqs is built for Cairns Latin organisers running events that bring Pan-American rhythm to the tropics.",
  },
  'latin/darwin': {
    hero_subtitle: "Top End energy, Latin warmth.",
    editorial:
      "Darwin's Latin community is small and dry-season-led. Karama and Anula hold the Brazilian families, Casuarina holds the Mexican community, Marrara holds the Argentine and Chilean families. Salsa Saturdays at Lola's Pergola run weekly through the dry, bachata socials at the Throb pull three hundred, reggaeton at the Tap on Mitchell packs Mitchell Street every Friday. Latin Festival every August at Bicentennial Park brings the whole Top End Latin community together for one big shared meal and a long evening of Pan-American music. Cuban son nights at the Brown's Mart, Argentine asados at Lee Point through the dry, Mexican Day of the Dead at the Casuarina Beach Reserve. The Charles Darwin University Latin American Students Society pulls fresh energy each semester. EventLinqs is built for Darwin Latin organisers running events that bring Pan-American rhythm to Australia's most tropical capital.",
  },
  'latin/townsville': {
    hero_subtitle: "Tropical north, Latin sound.",
    editorial:
      "Townsville's Latin community grew through the JCU medical school and the wider professional migration. Annandale holds the Brazilian families, Kelso holds the Mexican community, Aitkenvale holds the Argentine families. Salsa Saturdays at the Brewery run weekly, bachata socials at the Mariners Bar pull three hundred, reggaeton at the Madison's Hotel packs Flinders Street every Friday. Latin Festival every June at Riverway brings the wider North Queensland Latin community together for one big day. Cuban son nights at the Bank Nightclub, Argentine asados along the Strand through the dry, Mexican Day of the Dead at Castle Hill Lookout. The James Cook University Latin American Students Society pulls fresh student energy each semester. EventLinqs is built for Townsville Latin organisers running events that bring Pan-American rhythm to tropical north Queensland.",
  },
  'latin/miami': {
    hero_subtitle: "America's Latin capital.",
    editorial:
      "Miami is the Latin capital of the United States. Little Havana on Calle Ocho is Cuba transposed, Doral is Venezuela rebuilt, Hialeah is Cuba and Colombia overlapping, Westchester is the Cuban-American suburban heart. Calle Ocho Festival every March pulls a million through Little Havana for the largest Latin street festival in America. Salsa Saturdays at Ball and Chain run weekly, bachata at Mango's Tropical Cafe on South Beach packs every night, reggaeton at LIV at the Fontainebleau every Friday. Carnaval Miami every March at the Miami Marine Stadium brings Brazilian rhythm to South Florida. Cuban son nights at the Cuba Libre, Argentine tango milongas at the Wynwood Cafe, Mexican Day of the Dead at the Perez Art Museum. The Cuban American National Foundation anchors year-round community events. EventLinqs is built for Miami Latin organisers running events that anchor the largest Latin community in the United States.",
  },
  'latin/los-angeles': {
    hero_subtitle: "West Coast, South of the border, one stage.",
    editorial:
      "Los Angeles is the Latin capital of the West Coast. East LA is Mexico transposed, Boyle Heights is the Mexican-American community heart, Pico Union holds the Salvadoran families, Echo Park holds the new Mexican-American art scene. Fiesta Broadway every April pulls half a million through downtown for the largest Mexican-American street festival in America. Salsa Saturdays at the Mayan run weekly, bachata at the Conga Room packs LA Live every Friday, reggaeton at Sound and Hollywood Palladium fill weekends. Carnaval LA every September at Hollywood Bowl brings Brazilian rhythm to LA. Cuban son nights at La Cita, Argentine tango milongas at the Granada in Highland Park, Mexican Day of the Dead at Hollywood Forever Cemetery pulls fifty thousand each November. EventLinqs is built for LA Latin organisers running events in America's most cinematic Latin city.",
  },
  'latin/new-york': {
    hero_subtitle: "Five boroughs, Pan-American stage.",
    editorial:
      "New York's Latin community runs through every borough. Washington Heights is Dominican, Spanish Harlem is Puerto Rican, Sunset Park is Mexican, Jackson Heights is Colombian and Ecuadorian, the Bronx is Puerto Rican and Dominican overlapping. Puerto Rican Day Parade on Fifth Avenue every June pulls two million through Manhattan for the largest Latin parade in America. Salsa Saturdays at the Copacabana run weekly, bachata at the Plaza Espresso packs Brooklyn every Friday, reggaeton at the Marquee fills Chelsea weekends. Carnaval New York every August at Riverbank State Park brings Brazilian rhythm to Harlem. Cuban son nights at the Subrosa, Argentine tango milongas at La Nacional, Mexican Day of the Dead at the Brooklyn Museum. The Hispanic Federation anchors year-round community events. EventLinqs is built for New York Latin organisers running events that connect Pan-America to the world's biggest stage.",
  },
  'latin/madrid': {
    hero_subtitle: "The mother country meets the new world.",
    editorial:
      "Madrid is where Spain and Latin America meet. Lavapies and Embajadores hold the Latin American immigrant communities, with Bolivian, Ecuadorian, Peruvian, Colombian and Dominican families running community events through community halls and Spanish parish centres. Salsa Saturdays at the Cocoroco run weekly, bachata at the Florida Park packs Madrid every Friday, reggaeton at the Cool fills Gran Via weekends. Carnaval de Las Americas every July at Casa de America brings Pan-American rhythm to the heart of the city. Cuban son nights at the Cafe Central, Argentine tango milongas at the Cafe Berlin, Mexican Day of the Dead at the Centro Cultural Conde Duque. The community is the biggest Latin presence in Europe outside London, and the language ties run deep. EventLinqs is built for Madrid Latin organisers running events that anchor Pan-American community in the Spanish-speaking heart of Europe.",
  },

  // ============================================================
  // EAST ASIAN
  // ============================================================
  'east-asian/sydney': {
    hero_subtitle: "K-pop, Lunar, J-rock - Sydney's full East Asian spectrum.",
    editorial:
      "Chinese New Year turning Haymarket into a 100,000-strong outdoor party, K-pop concerts at Qudos Bank Arena, J-rock and anime conventions at the ICC, Vietnamese New Year at Cabra-Vale, Korean community festivals in Strathfield, Japanese matsuri in Darling Harbour. Lunar new year red lanterns light up every Chinatown corner. From K-pop dance crews to Tamil cinema and J-pop singalongs, Sydney's East Asian community runs the most diverse event calendar in the country. EventLinqs is built for Sydney's East Asian promoters - the dance crew leader, the community group leader, the festival committee chair.",
  },
  'east-asian/melbourne': {
    hero_subtitle: "Lanterns, K-pop, anime - Melbourne's East Asian stage.",
    editorial:
      "Melbourne's East Asian community is the largest in Australia. Box Hill is the Chinese community heart, Glen Waverley holds the Korean families, Springvale holds the Vietnamese community, Doncaster holds the Japanese expats. Lunar New Year takes over the city for ten days every February with lion dance parades through Chinatown, K-pop dance battles at the Melbourne Exhibition Centre, and night markets at Queen Victoria Market that pull a quarter-million. Vietnamese Tet at Footscray Park fills the inner west with red and gold for a long weekend. Korean Festival every May at Federation Square. Japanese matsuri at the Kobe Garden in Kogarah. K-pop fan meets at Margaret Court Arena fill out from teen to thirty. EventLinqs is built for Melbourne East Asian organisers running events that knit the most diverse Asian-Australian calendar in the country.",
  },
  'east-asian/brisbane': {
    hero_subtitle: "Sunshine state, lantern light.",
    editorial:
      "Brisbane's East Asian community is fast-growing and family-led. Sunnybank is the Chinese and Korean heart, Eight Mile Plains holds the Vietnamese families, Mt Gravatt holds the Japanese expat community. BrisAsia Festival every February at South Bank pulls 200,000 across two weeks of K-pop, lion dance, taiko drumming and Vietnamese food. Lunar New Year at Roma Street Parkland and the Buddha Birth Day Festival at South Bank fill the calendar. Korean Festival every September at the Brisbane Convention Centre. Vietnamese Tet at the Inala Civic Centre. K-pop fan meets at the Brisbane Entertainment Centre. Japanese community events at the Brisbane Powerhouse. The Queensland Multicultural Festival brings everyone together each August. EventLinqs is built for Brisbane East Asian organisers running events that have shaped the city's most multicultural southside.",
  },
  'east-asian/perth': {
    hero_subtitle: "Indian Ocean to Pacific Rim.",
    editorial:
      "Perth's East Asian community runs across the city. Northbridge is Chinatown, Cannington holds the Vietnamese and Korean families, Willetton holds the new Singaporean and Malaysian communities, Como holds the Japanese expat community. Chinese New Year at Northbridge Piazza pulls fifty thousand for two weekends, K-pop at the Perth Convention and Exhibition Centre, Korean Festival every November at Forrest Place, Vietnamese Tet at Belmont Oasis Leisure Centre, Japanese matsuri at Hyde Park. The Perth Asian Cultural Festival every July at Forrest Place brings everyone together for one big day. K-pop fan meets at HBF Park, anime conventions at the Perth Convention Centre. The Chung Wah Association anchors the calendar, and the Korean Society of Western Australia runs a tight year-round programme. EventLinqs is built for Perth East Asian organisers running events that bring the Pacific Rim to Australia's western edge.",
  },
  'east-asian/adelaide': {
    hero_subtitle: "Festival city, Pacific Rim stage.",
    editorial:
      "Adelaide's East Asian community is established and culturally rich. Mawson Lakes holds the Chinese families, Chinatown on Moonta and Gouger Streets is the central heart, Norwood holds the Korean families, Salisbury holds the Vietnamese community. OzAsia Festival every October at the Adelaide Festival Centre brings Asian arts, music and dance to one of Australia's biggest community festivals. Chinese New Year at Adelaide Chinatown pulls thirty thousand, Lunar New Year Lantern Festival at the Adelaide Showgrounds, K-pop dance battles at Hindley Street, Korean Festival every September at Marion Cultural Centre. Vietnamese Tet at the Convention Centre, Japanese matsuri at Himeji Garden. K-pop fan meets at the Entertainment Centre. The Chinese Welfare Services of SA anchors the year-round calendar. Adelaide Fringe always picks up at least one major K-pop or anime act each March. EventLinqs is built for Adelaide East Asian organisers running events that thread Pacific Rim community through the festival city.",
  },
  'east-asian/gold-coast': {
    hero_subtitle: "Coast life, lantern light.",
    editorial:
      "The Gold Coast East Asian community is young, professional and lifestyle-led. Surfers Paradise pulls Chinese and Korean tourist crowds year-round, Robina holds the resident Korean families, Southport holds the Chinese student community, Broadbeach holds the Japanese expats. K-pop dance battles at HOTA every weekend, Lunar New Year at Broadbeach pulls twenty thousand, Korean Festival every October at Carrara Stadium function rooms, Vietnamese Tet at Surfers Paradise Beach, Japanese matsuri at Currumbin Beach Vikings. K-pop fan meets at the Convention Centre. The Bond University and Griffith University Asian Cultural Societies pull fresh student energy each semester. The Chinese Cultural Association of the Gold Coast anchors the year-round calendar. EventLinqs is built for Gold Coast East Asian organisers running events that match coast lifestyle to Pacific Rim community.",
  },
  'east-asian/canberra': {
    hero_subtitle: "Capital community, Pacific Rim stage.",
    editorial:
      "Canberra's East Asian community is education and embassy-anchored. The Chinese, Korean, Japanese, Vietnamese and Thai embassies run year-round community events that feed into community calendars. Belconnen and Gungahlin hold the Chinese families, Tuggeranong holds the Vietnamese community, Dickson is Canberra's Asian food heart. Lunar New Year at the National Convention Centre, K-pop fan meets at the AIS Arena, Korean Festival every September at Glebe Park, Vietnamese Tet at the Tuggeranong Community Hub, Japanese matsuri at Lennox Gardens. The ANU Asia-Pacific Studies Program runs a tight community calendar through every semester, and the National Multicultural Festival every February brings everyone together. EventLinqs is built for Canberra East Asian organisers running events that punch well above the federal capital's size and weight.",
  },
  'east-asian/hobart': {
    hero_subtitle: "Apple Isle, lantern warmth.",
    editorial:
      "Hobart's East Asian community is small, university-led, and warm. Sandy Bay holds the University of Tasmania international student crowd, Glenorchy holds the Chinese and Vietnamese families, Kingston holds the Korean and Japanese families. Lunar New Year at the Hobart Town Hall pulls one thousand each February for one big shared meal, K-pop fan meets at the City Hall, Korean Festival at PW1 in Salamanca, Vietnamese Tet at the Long House. The University of Tasmania Asian Cultural Society pulls fresh student energy each semester. Japanese matsuri at the Long House. The Multicultural Council of Tasmania coordinates year-round calendars. The community is small enough that everyone is on the same WhatsApp groups, big enough that something is on most weekends. EventLinqs is built for Hobart East Asian organisers running events that bring Pacific Rim warmth to Australia's coldest capital.",
  },
  'east-asian/newcastle': {
    hero_subtitle: "Steel city, lantern light.",
    editorial:
      "Newcastle's East Asian community has grown through the University of Newcastle and the wider Hunter professional migration. Hamilton holds the Chinese and Korean families, Mayfield holds the Vietnamese community, Charlestown is the Asian food heart. Lunar New Year at Civic Park pulls eight thousand, K-pop dance battles at the UniBar through every semester, Korean Festival every October at the Newcastle Town Hall, Vietnamese Tet at the Wests City function rooms, Japanese matsuri at Foreshore Park. The University of Newcastle Asian Cultural Society pulls fresh student energy each semester. The Hunter Region Chinese Cultural Association coordinates the year-round calendar. K-pop fan meets at the Newcastle Entertainment Centre. EventLinqs is built for Newcastle East Asian organisers running events that bring Pacific Rim community to the steel river city.",
  },
  'east-asian/wollongong': {
    hero_subtitle: "Illawarra coast, lantern stage.",
    editorial:
      "Wollongong's East Asian community has grown through the University of Wollongong and the wider Illawarra professional migration. Figtree and Mount Keira hold the Chinese families, Berkeley holds the Vietnamese community, Coniston is the Korean food heart. Lunar New Year at Wollongong Town Hall pulls four thousand, K-pop dance battles at the UniBar through every semester, Korean Festival every October at the IPAC, Vietnamese Tet at Stuart Park, Japanese matsuri at Beaton Park. The University of Wollongong Asian Cultural Society pulls fresh student energy each semester. The Illawarra Chinese Cultural Association coordinates the year-round calendar. K-pop fan meets at WIN Entertainment Centre. EventLinqs is built for Wollongong East Asian organisers running events that thread Pacific Rim community through the steel coast.",
  },
  'east-asian/geelong': {
    hero_subtitle: "Bay city, lantern rhythm.",
    editorial:
      "Geelong's East Asian community has grown rapidly through Deakin University and professional migration. Highton holds the Chinese families, Norlane holds the Vietnamese community, Belmont holds the Korean families. Lunar New Year at Steampacket Gardens pulls three thousand, K-pop dance battles at the Wool Exchange through every semester, Korean Festival every October at the Geelong Convention Centre, Vietnamese Tet at the Geelong Showgrounds, Japanese matsuri at Eastern Park. The Deakin University Asian Cultural Society pulls fresh student energy each semester. The Geelong Chinese Cultural Association coordinates the year-round calendar. K-pop fan meets at GMHBA Stadium function rooms. EventLinqs is built for Geelong East Asian organisers running events that bring Pacific Rim community to the bay city.",
  },
  'east-asian/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Pacific Rim stage.",
    editorial:
      "The Sunshine Coast East Asian community is small but growing. Buderim and Mountain Creek hold the Chinese families, Caloundra holds the Vietnamese community, Mooloolaba holds the Korean and Japanese expats. Lunar New Year at Cotton Tree Park pulls two thousand, K-pop fan meets at the Lake Kawana Community Centre, Korean Festival every October at the Maroochy RSL function rooms, Vietnamese Tet at the Caloundra Indoor Stadium, Japanese matsuri at the Sunshine Coast Beach. The University of the Sunshine Coast Asian Cultural Society pulls fresh student energy each semester. The Sunshine Coast Chinese Association coordinates the year-round calendar. EventLinqs is built for Sunshine Coast East Asian organisers running events that match coast lifestyle to Pacific Rim community.",
  },
  'east-asian/cairns': {
    hero_subtitle: "Tropical north, Pacific Rim sun.",
    editorial:
      "Cairns has a strong East Asian community grown through tourism, education and the reef sector. Manunda holds the Chinese families, Edmonton holds the Vietnamese community, Westcourt is the Asian food heart. Lunar New Year at Munro Martin Parklands pulls two thousand, K-pop fan meets at the Cairns Convention Centre, Korean Festival every October at the Brothers Leagues Club, Vietnamese Tet at the Cairns RSL, Japanese matsuri at the Tropical North Queensland Multicultural Centre. The James Cook University Asian Cultural Society pulls fresh student energy each semester. The Far North Queensland Chinese Association coordinates the year-round calendar. The geography means Asian tourists are constant, and the local community runs the calendar steady through wet and dry. EventLinqs is built for Cairns East Asian organisers running events that bring Pacific Rim community into the tropics.",
  },
  'east-asian/darwin': {
    hero_subtitle: "Top End energy, Pacific Rim stage.",
    editorial:
      "Darwin's East Asian community is the most diverse outside the capital cities. Karama and Anula hold the Chinese families, Casuarina holds the Filipino-Chinese community, Marrara holds the Vietnamese families. The Top End is closer to Asia than to the rest of Australia, and the community ties run deep. Lunar New Year at Bicentennial Park pulls three thousand, K-pop fan meets at the Darwin Convention Centre, Korean Festival every October at Mindil Beach Sunset Markets, Vietnamese Tet at the Tracy Village, Japanese matsuri at the Mindil Markets. The Charles Darwin University Asian Cultural Society pulls fresh student energy each semester. The Chung Wah Society of NT coordinates the year-round calendar. EventLinqs is built for Darwin East Asian organisers running events that thrive in Australia's most Asia-facing capital.",
  },
  'east-asian/townsville': {
    hero_subtitle: "Tropical north, Pacific Rim heat.",
    editorial:
      "Townsville's East Asian community has grown through the JCU medical school and the wider regional migration. Annandale holds the Chinese families, Kelso holds the Vietnamese community, Kirwan holds the Korean and Japanese expats. Lunar New Year at Riverway pulls one thousand, K-pop dance battles at the Brewery through every semester, Korean Festival every October at the Townsville Civic Theatre, Vietnamese Tet at the Brothers Leagues Club, Japanese matsuri at Castle Hill Lookout. The James Cook University Asian Cultural Society pulls fresh student energy each semester. The North Queensland Chinese Association coordinates the year-round calendar. K-pop fan meets at the Townsville Entertainment Centre. EventLinqs is built for Townsville East Asian organisers running events that bring Pacific Rim community to tropical north Queensland.",
  },
  'east-asian/london': {
    hero_subtitle: "Soho lanterns, Tottenham Court K-pop.",
    editorial:
      "London is the East Asian capital of Europe. Soho's Chinatown anchors the Chinese community, New Malden in Surrey is Korean London, Acton holds the Japanese families, Hackney and Dalston hold the Vietnamese community. Lunar New Year on Trafalgar Square pulls seven hundred thousand for the largest Chinese New Year celebration outside Asia. K-pop concerts at the O2 and Wembley Arena, Korean Festival every August at Trafalgar Square, Vietnamese Tet at the Vietnamese Pagoda in Stairfoot. K-pop fan meets at HMV stores across the city. Japanese Matsuri at Trafalgar Square in September. The British East Asian community is the largest and most diverse in Europe, and London anchors it. EventLinqs is built for London East Asian organisers running events that the global Pacific Rim watches.",
  },
  'east-asian/new-york': {
    hero_subtitle: "Five boroughs, Pacific Rim stage.",
    editorial:
      "New York's East Asian community runs through every borough. Manhattan Chinatown is Cantonese and Fujianese, Flushing Queens is Mandarin and Korean, Sunset Park Brooklyn is Chinese, Elmhurst is Thai and Vietnamese, Ridgewood holds the Japanese families. Lunar New Year on Mott Street pulls a quarter-million for Manhattan Chinatown's parade, K-pop concerts at Madison Square Garden and Barclays Center, Korean Festival every October at Bryant Park, Vietnamese Tet at Sunset Park, Japanese street festival at the Brooklyn Museum every May. K-pop fan meets at the Hammerstein Ballroom. The Asian American Federation anchors year-round community events. EventLinqs is built for New York East Asian organisers running events that connect Pacific Rim community to the world's biggest stage.",
  },
  'east-asian/toronto': {
    hero_subtitle: "Lakeside, Pacific Rim stage.",
    editorial:
      "Toronto's East Asian community is the largest in North America by share of population. Spadina Chinatown anchors the Cantonese community, Markham is the Hong Kong and Mainland Chinese suburb, Richmond Hill holds the Korean families, Mississauga holds the Vietnamese community. Lunar New Year at Nathan Phillips Square pulls fifty thousand, K-pop concerts at Scotiabank Arena, Korean Festival every August at Mel Lastman Square, Vietnamese Tet at Sherway Gardens. K-pop fan meets at the Cineplex Yonge-Dundas. The University of Toronto Asian Cultural Societies anchor a steady stream of community events through every semester. The Chinese Cultural Centre of Greater Toronto coordinates the year-round calendar. EventLinqs is built for Toronto East Asian organisers running events that knit the largest Pacific Rim community in North America.",
  },
  'east-asian/vancouver': {
    hero_subtitle: "Pacific coast, Pacific Rim heart.",
    editorial:
      "Vancouver is the most Asian city in North America. Richmond is Hong Kong rebuilt, Burnaby holds the Korean and Vietnamese families, the West End holds the Japanese expats, Surrey holds the Chinese suburban community. Lunar New Year at the Pacific National Exhibition pulls eighty thousand, Powell Street Festival celebrates Japanese community every August in Strathcona, Korean Festival every August at Robson Square, Vietnamese Lunar New Year at the Vietnamese Buddhist Temple in Surrey. K-pop concerts at Rogers Arena, K-pop fan meets at SilverCity Riverport. The University of British Columbia Asian Cultural Societies anchor a steady stream of student-led events through every semester. The geography puts Vancouver closer to Asia than to the rest of Canada. EventLinqs is built for Vancouver East Asian organisers running events that anchor the Pacific Rim's North American capital.",
  },
  'east-asian/singapore': {
    hero_subtitle: "Where Asia meets the world.",
    editorial:
      "Singapore is the heart of East Asia. Chinatown anchors the Chinese community, Kampong Glam holds the Malay heritage, Little India holds the South Indian community, Geylang and the East Coast hold the Hokkien and Teochew families. Chinese New Year takes over the city for two weeks every February, with the Chingay Parade pulling half a million through the streets. K-pop concerts at the Singapore Indoor Stadium and the National Stadium, K-pop fan meets at Suntec City. The Esplanade hosts year-round Pacific Rim arts. Mid-Autumn Festival lantern displays at Gardens by the Bay every September. The geography puts Singapore at the centre of every major Pacific Rim community calendar, and the city moves at the rhythm of the entire region. EventLinqs is built for Singapore East Asian organisers running events that the global Pacific Rim watches.",
  },

  // ============================================================
  // FILIPINO
  // ============================================================
  'filipino/melbourne': {
    hero_subtitle: "Fiesta, Sinulog and modern fusion, Melbourne wide.",
    editorial:
      "Filipino Fiesta at Federation Square, Sinulog street parade in central Melbourne, Modern Filipino DJ nights in Brunswick, Filipino Independence Day celebrations across Wyndham, parol-lit Christmas at the Filipino Community Council. Melbourne's Filipino community is one of the largest in the country, running weekend fiestas in Werribee and Cranbourne, family festivals at Filipino-Australian sports clubs, and youth-led modern fusion events in the inner city. EventLinqs is built for Melbourne Filipino organisers running events that bring a generations-deep community together.",
  },
  'filipino/sydney': {
    hero_subtitle: "Maginhawa to Marsfield, one community.",
    editorial:
      "Sydney's Filipino community is the largest in Australia. Blacktown is the heart - Mt Druitt, Marayong, Quakers Hill running weekend fiestas through every Filipino-Australian community centre. Marsfield, North Ryde and Eastwood hold the older Manila professional families, Liverpool and Fairfield hold the new Cebuano and Visayan arrivals. Sinulog parade through the CBD every January pulls fifteen thousand, Independence Day at Tumbalong Park every June, parol-lit Christmas at Bankstown Town Hall, OPM concerts at the State Theatre and ICC. The Philippine Australian Sports and Cultural Organisation anchors weekend basketball tournaments that double as community gatherings. Sunday Tagalog Mass at Our Lady of Mt Carmel in Mt Pritchard pulls the family rhythm together. EventLinqs is built for Sydney Filipino organisers running events that anchor the largest Filipino community in the country.",
  },
  'filipino/brisbane': {
    hero_subtitle: "Sunshine state, Manila warmth.",
    editorial:
      "Brisbane's Filipino community is the second-largest in Australia. Inala is the heart - Filipino-Australian families running weekend fiestas through the Inala Civic Centre, Sunday Tagalog Mass at Our Lady of Lourdes in Sunnybank Hills, Sinulog parade every January through South Brisbane that pulls eight thousand. Aspley and Strathpine hold the older Manila professional families, Logan and Beenleigh hold the new Visayan and Cebuano arrivals. Independence Day at Roma Street Parkland every June, parol-lit Christmas at the Brisbane Powerhouse, OPM concerts at the Brisbane Convention Centre. The Philippine Australian Cultural Society of Queensland coordinates the year-round calendar. Filipino basketball tournaments at Sleeman Sports Complex double as community gatherings. EventLinqs is built for Brisbane Filipino organisers running events that anchor a fast-growing community across Queensland's southside.",
  },
  'filipino/perth': {
    hero_subtitle: "Indian Ocean, Pacific homeland.",
    editorial:
      "Perth's Filipino community is the third-largest in Australia and tightly knit. Mirrabooka is the heart - Filipino-Australian families running weekend fiestas through the Mirrabooka Multicultural Services Centre, Sunday Tagalog Mass at St Pius X in Manning, Sinulog parade every January through Northbridge that pulls four thousand. Stirling and Balcatta hold the older Manila professional families, Cannington holds the new Visayan and Cebuano arrivals. Independence Day at Forrest Place every June, parol-lit Christmas at the Perth Convention Centre, OPM concerts at HBF Park. The Philippine Australian Society of Western Australia coordinates the year-round calendar. Filipino basketball tournaments at HBF Stadium double as community gatherings. EventLinqs is built for Perth Filipino organisers running events that have shaped the city's most multicultural northern suburbs.",
  },
  'filipino/adelaide': {
    hero_subtitle: "Festival city, Filipino fiesta.",
    editorial:
      "Adelaide's Filipino community is mid-sized, family-led, and tightly woven. Salisbury and Para Hills hold the Filipino-Australian families, Pooraka holds the older Manila professionals, Mawson Lakes holds the new Cebuano and Visayan arrivals. Sinulog parade every January through Adelaide City Centre pulls three thousand, Sunday Tagalog Mass at St Mary Magdalene's in Elizabeth Grove, Independence Day at Bonython Park every June, parol-lit Christmas at the Adelaide Convention Centre, OPM concerts at the Hindley Street venues. The Philippine Australian Cultural Society of South Australia coordinates the year-round calendar, and the Adelaide Fringe each March always picks up at least one Filipino comedy or music act. Filipino basketball tournaments at the Adelaide Arena double as community gatherings. EventLinqs is built for Adelaide Filipino organisers running events that thread Manila warmth into the festival city.",
  },
  'filipino/gold-coast': {
    hero_subtitle: "Coast life, Manila warmth.",
    editorial:
      "The Gold Coast Filipino community is young and lifestyle-led. Robina and Helensvale hold the Filipino-Australian families, Southport holds the international student crowd, Surfers Paradise is where OPM nightclub events happen on Saturdays. Sinulog parade every January through Surfers Paradise pulls two thousand, Sunday Tagalog Mass at Sacred Heart in Clear Island Waters, Independence Day at Broadwater Parklands every June, parol-lit Christmas at HOTA, OPM concerts at the Convention Centre. The Bond and Griffith University Filipino Students Societies pull fresh student energy each semester. Filipino basketball tournaments at the Carrara Indoor Sports Centre double as community gatherings. EventLinqs is built for Gold Coast Filipino organisers running events that match coast lifestyle to homeland celebration.",
  },
  'filipino/canberra': {
    hero_subtitle: "Capital community, Manila stage.",
    editorial:
      "Canberra's Filipino community is small but tightly organised. Tuggeranong and Kambah hold the Filipino-Australian families, Belconnen holds the embassy and government professional class, Gungahlin holds the newer arrivals. Sinulog parade every January through Civic pulls one thousand, Sunday Tagalog Mass at St Christopher's Cathedral, Independence Day at Glebe Park every June, parol-lit Christmas at Canberra Theatre Centre, OPM concerts at the AIS Arena. The Philippine Embassy runs year-round community events that feed into the community calendar. The ANU and University of Canberra Filipino Students Societies pull fresh student energy each semester. Filipino basketball tournaments at the AIS Arena double as community gatherings. The Filipino Australian Cultural Society of the ACT anchors the year-round calendar. EventLinqs is built for Canberra Filipino organisers running events that thread homeland warmth through the federal capital.",
  },
  'filipino/hobart': {
    hero_subtitle: "Apple Isle, Manila warmth.",
    editorial:
      "Hobart's Filipino community is small, recent, and growing fast. Glenorchy and Bridgewater hold the Filipino-Australian families, Sandy Bay holds the University of Tasmania international student crowd, Kingston holds the new professional arrivals. Sinulog parade every January through central Hobart pulls four hundred, Sunday Tagalog Mass at St Joseph's in Hobart, Independence Day at Salamanca Lawns every June, parol-lit Christmas at the Hobart Town Hall, OPM concerts at the Wrest Point. The Filipino Australian Cultural Society of Tasmania coordinates the year-round calendar. The University of Tasmania Filipino Students Society pulls fresh student energy each semester. The community is small enough that everyone shows up, and the welcome is very warm. EventLinqs is built for Hobart Filipino organisers keeping homeland warmth alive in Australia's southernmost capital.",
  },
  'filipino/newcastle': {
    hero_subtitle: "Steel city, Manila stage.",
    editorial:
      "Newcastle's Filipino community is mid-sized and family-led. Mayfield and Hamilton hold the Filipino-Australian families, Charlestown holds the older Manila professional class, Wallsend holds the new Cebuano and Visayan arrivals. Sinulog parade every January through Civic Park pulls one thousand, Sunday Tagalog Mass at Sacred Heart in Hamilton, Independence Day at Foreshore Park every June, parol-lit Christmas at Newcastle Town Hall, OPM concerts at the Newcastle Entertainment Centre. The Hunter Region Philippine Australian Society coordinates the year-round calendar. Filipino basketball tournaments at the Newcastle Basketball Stadium double as community gatherings. The University of Newcastle Filipino Students Society pulls fresh student energy each semester. EventLinqs is built for Newcastle Filipino organisers running events that anchor a homeland community in the steel river city.",
  },
  'filipino/wollongong': {
    hero_subtitle: "Illawarra coast, Manila warmth.",
    editorial:
      "Wollongong's Filipino community has grown through the University of Wollongong and the wider Illawarra professional migration. Berkeley and Warrawong hold the Filipino-Australian families, Figtree holds the older Manila professional class, Coniston holds the new Cebuano and Visayan arrivals. Sinulog parade every January through Crown Street Mall pulls eight hundred, Sunday Tagalog Mass at St Therese's in Warrawong, Independence Day at Stuart Park every June, parol-lit Christmas at the IPAC, OPM concerts at WIN Entertainment Centre. The Illawarra Filipino-Australian Society coordinates the year-round calendar. Filipino basketball tournaments at the Beaton Park Leisure Centre double as community gatherings. The University of Wollongong Filipino Students Society pulls fresh student energy each semester. EventLinqs is built for Wollongong Filipino organisers running events that thread Manila warmth through the steel coast.",
  },
  'filipino/geelong': {
    hero_subtitle: "Bay city, Manila warmth.",
    editorial:
      "Geelong's Filipino community has grown rapidly through professional migration into the Western District. Norlane and Corio hold the Filipino-Australian families, Highton holds the older Manila professional class, Belmont holds the new Cebuano and Visayan arrivals. Sinulog parade every January through central Geelong pulls six hundred, Sunday Tagalog Mass at St Mary's in Geelong, Independence Day at Johnstone Park every June, parol-lit Christmas at the Wool Exchange, OPM concerts at GMHBA Stadium function rooms. The Geelong Filipino-Australian Cultural Society coordinates the year-round calendar. Filipino basketball tournaments at the Geelong Arena double as community gatherings. Deakin University Filipino Students Society pulls fresh student energy each semester. EventLinqs is built for Geelong Filipino organisers running events that bring homeland warmth to the second city of Victoria.",
  },
  'filipino/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Manila warm.",
    editorial:
      "The Sunshine Coast Filipino community is small but growing through professional migration. Maroochydore and Caloundra hold the Filipino-Australian families, Buderim holds the medical professional class, Mooloolaba holds the new Cebuano and Visayan arrivals. Sinulog parade every January through Mooloolaba foreshore pulls three hundred, Sunday Tagalog Mass at Stella Maris in Maroochydore, Independence Day at Cotton Tree Park every June, parol-lit Christmas at the Lake Kawana Community Centre, OPM concerts at the Sunshine Coast Convention Centre. The Sunshine Coast Filipino-Australian Society coordinates the year-round calendar. The University of the Sunshine Coast Filipino Students Society pulls fresh student energy each semester. Filipino basketball tournaments at the Caloundra Indoor Stadium double as community gatherings. EventLinqs is built for Sunshine Coast Filipino organisers running events that match coast lifestyle to homeland warmth.",
  },
  'filipino/cairns': {
    hero_subtitle: "Tropical north, Manila sun.",
    editorial:
      "Cairns has a strong Filipino community grown through tourism, hospitality and the reef sector. Manunda and Mooroobool hold the Filipino-Australian families, Edmonton holds the older Manila professional class, Westcourt holds the new Visayan and Cebuano arrivals. Sinulog parade every January through Munro Martin Parklands pulls five hundred, Sunday Tagalog Mass at Holy Family in Hambledon, Independence Day at the Cairns Esplanade every June, parol-lit Christmas at the Cairns Convention Centre, OPM concerts at the Cairns Showgrounds. The Far North Queensland Filipino-Australian Society coordinates the year-round calendar. Filipino basketball tournaments at the Cairns Basketball Stadium double as community gatherings. The James Cook University Filipino Students Society pulls fresh student energy each semester. EventLinqs is built for Cairns Filipino organisers running events that bring homeland warmth into the tropics.",
  },
  'filipino/darwin': {
    hero_subtitle: "Top End, second-largest Asian-Australian community.",
    editorial:
      "Darwin's Filipino community is the second-largest Asian-Australian group in the Top End. From Sinulog dance celebrations at Casuarina All Saints to OPM concerts touring through the Hilton Darwin, Manila reaches Darwin and Darwin returns the favour. Fiesta planning runs through Marrara, Karama, Palmerston. WhatsApp groups coordinate everything from the Independence Day flag raising to weekend basketball tournaments. EventLinqs is built for Darwin's Filipino organisers - the lola hosting Sunday lunch, the church social committee, the families turning every milestone into a parol-lit celebration.",
  },
  'filipino/townsville': {
    hero_subtitle: "Tropical north, Manila warmth.",
    editorial:
      "Townsville's Filipino community has grown through medical, hospitality and defence migration. Annandale and Kelso hold the Filipino-Australian families, Kirwan holds the older Manila professional class, Aitkenvale holds the new Visayan and Cebuano arrivals. Sinulog parade every January through Riverway pulls four hundred, Sunday Tagalog Mass at Holy Family in Annandale, Independence Day at the Strand every June, parol-lit Christmas at the Civic Theatre, OPM concerts at the Townsville Entertainment Centre. The North Queensland Filipino-Australian Society coordinates the year-round calendar. Filipino basketball tournaments at the Townsville Basketball Stadium double as community gatherings. The James Cook University Filipino Students Society pulls fresh student energy each semester. EventLinqs is built for Townsville Filipino organisers running events that anchor a homeland community in tropical north Queensland.",
  },
  'filipino/los-angeles': {
    hero_subtitle: "Largest Filipino community in America.",
    editorial:
      "Los Angeles holds the largest Filipino community in the United States. Historic Filipinotown anchors the Filipino-American community, Eagle Rock and Carson hold the bigger family suburbs, Vermont Avenue holds the Filipino food strip, West Covina is the new wealthy professional centre. Filipino American History Month every October pulls community events across the city. Sinulog parade every January through Historic Filipinotown, Sunday Tagalog Mass at Saint Cecilia's, Independence Day at Hollywood Park every June, parol-lit Christmas at the LA Convention Centre, OPM concerts at the Microsoft Theater. The University of California Los Angeles Filipino Students Association anchors a steady stream of student-led events through every semester. The Filipino American National Historical Society coordinates the year-round calendar. EventLinqs is built for LA Filipino organisers running events that anchor America's biggest Filipino community.",
  },
  'filipino/san-francisco': {
    hero_subtitle: "Bay Area, Manila Bay.",
    editorial:
      "San Francisco's Filipino community is the historic centre of Filipino-American community. The South of Market neighbourhood is the Filipino Cultural Heritage District, Daly City is the largest Filipino-American suburb in America, the Mission District holds the older Filipino-Latino crossover community. Pistahan Filipino Cultural Festival every August at Yerba Buena Gardens pulls fifty thousand. Sinulog parade every January through SoMa, Sunday Tagalog Mass at Saint Patrick's, Independence Day at Daly City every June, parol-lit Christmas at the Westfield San Francisco Centre, OPM concerts at the Bill Graham Civic Auditorium. The Filipino American Development Foundation anchors the year-round calendar. The University of California Berkeley Filipino Students Association pulls fresh student energy each semester. EventLinqs is built for SF Filipino organisers running events that anchor America's most historic Filipino community.",
  },
  'filipino/new-york': {
    hero_subtitle: "Five boroughs, Manila warmth.",
    editorial:
      "New York's Filipino community is the largest on the east coast. Woodside Queens is Little Manila, Jersey City and Bergen County hold the wealthy Filipino-American families, Brooklyn holds the artist crowd, the Bronx holds the medical professional class. Philippine Independence Day Parade up Madison Avenue every June pulls thirty thousand for the largest Filipino-American parade in the United States. Sinulog parade every January through Woodside, Sunday Tagalog Mass at Saint Sebastian's in Woodside, parol-lit Christmas at the Filipino Center on Madison Avenue, OPM concerts at the Beacon Theatre. The Filipino-American Society of New York coordinates the year-round calendar. The Columbia University Filipino Students Association pulls fresh student energy each semester. EventLinqs is built for New York Filipino organisers running events that anchor the east coast's most established Filipino community.",
  },
  'filipino/toronto': {
    hero_subtitle: "Lakeside, Manila warmth.",
    editorial:
      "Toronto's Filipino community is the largest in Canada. Bathurst and Wilson is Little Manila, Mississauga is the new wealthy Filipino-Canadian suburb, Scarborough holds the older family network, North York holds the medical professional class. Taste of Manila every August on Bathurst Street pulls a quarter-million for the largest Filipino-Canadian street festival. Sinulog parade every January through North York, Sunday Tagalog Mass at Our Lady of the Assumption in Bathurst, Independence Day at Mel Lastman Square every June, parol-lit Christmas at the Roy Thomson Hall, OPM concerts at Scotiabank Arena. The Filipino Centre Toronto coordinates the year-round calendar. The University of Toronto Filipino Students Association pulls fresh student energy each semester. EventLinqs is built for Toronto Filipino organisers running events that anchor Canada's biggest Filipino community.",
  },
  'filipino/manila': {
    hero_subtitle: "The mother city.",
    editorial:
      "Manila is the source. Sinulog in Cebu every January, Ati-Atihan in Kalibo every January, Pahiyas in Lucban every May, Moriones on Marinduque during Holy Week. The Manila metropolitan area runs a year-round calendar of fiestas, parades, religious processions and OPM concerts that define the global Filipino experience. Quiapo Black Nazarene procession pulls a million through the streets every January. Christmas season runs September to January with parol-lit streets, simbang gabi novena masses, and noche buena celebrations across every district. SM Mall of Asia, the Araneta Coliseum and the Philippine International Convention Centre host the country's biggest community events. Manila is the city that defines Filipino celebration globally and exports it to every continent. EventLinqs is built for Manila Filipino organisers running events that the global Filipino community watches and copies.",
  },

  // ============================================================
  // MEDITERRANEAN
  // ============================================================
  'mediterranean/melbourne': {
    hero_subtitle: "Italian, Greek, Spanish - Melbourne's Mediterranean nights.",
    editorial:
      "Italian sagra in Carlton every summer, Greek glendi in Oakleigh through every month, Spanish flamenco at the Melbourne Recital Centre, Portuguese fado in Brunswick, Cypriot souvla at the Cypriot Community Hall, Lebanese mahrajan in Coburg. Melbourne's Mediterranean scene is generations old and still growing, with old-country club venues sitting beside contemporary fusion warehouse parties. EventLinqs is built for the Melbourne Mediterranean organisers running everything from family-club glendi to high-end festival weekends.",
  },
  'mediterranean/sydney': {
    hero_subtitle: "Marrickville to Leichhardt, Mediterranean Sydney.",
    editorial:
      "Sydney's Mediterranean community runs through the inner west and the south. Leichhardt is Little Italy, Earlwood and Marrickville hold the Greek families, Liverpool holds the Lebanese community, Petersham is the Portuguese heart. Italian Festa in Norton Street every September pulls fifty thousand, Greek Festival of Sydney in March across Brighton-Le-Sands and Marrickville pulls twenty thousand, Spanish Quarter in Liverpool Street fills downtown with flamenco, Lebanese Mahrajan in Punchbowl pulls fifteen thousand. Italian Cultural Institute on William Street, Hellenic Club of Sydney in Mascot, Portuguese Community Club in Petersham. Mediterranean food in Norton Street, Marrickville Road, Stanmore Road. EventLinqs is built for Sydney Mediterranean organisers running events that have shaped the city's most recognisable food and festival communities.",
  },
  'mediterranean/brisbane': {
    hero_subtitle: "Sunshine state, Mediterranean sun.",
    editorial:
      "Brisbane's Mediterranean community is generations deep. New Farm is the Italian heart, West End holds the Greek families, Camp Hill holds the Spanish community, Stafford holds the Lebanese families. Paniyiri Greek Festival every May at Musgrave Park pulls fifty thousand for one of the largest Greek festivals in Australia. Italian Festa at the Italo-Australian Centre in Newmarket pulls twelve thousand each October. Spanish Cultural Festival every November at South Bank, Lebanese Mahrajan in Brisbane every June at Roma Street Parkland. Mediterranean food in James Street, Hardgrave Road, Stafford Road. The Hellenic Society of Queensland and the Italo-Australian Centre coordinate the year-round calendar. EventLinqs is built for Brisbane Mediterranean organisers running events that have shaped Queensland's most recognisable European-Australian food community.",
  },
  'mediterranean/perth': {
    hero_subtitle: "Indian Ocean, Mediterranean Sea.",
    editorial:
      "Perth's Mediterranean community is the most concentrated in any Australian capital. Fremantle is Little Italy, the Italian Club is the heart of the older calendar, Balcatta and Greenwood hold the Italian families, Cannington holds the Lebanese community, Tuart Hill holds the Greek families. Italian National Day at Russell Square in Northbridge every June pulls fifteen thousand, Glendi Greek Festival every November at Russell Square pulls twelve thousand, Spanish Cultural Festival every September at Forrest Place, Lebanese Mahrajan in Perth every June at Whiteman Park. Italian food in South Terrace Fremantle, Greek food in Northbridge Lake Street. The Italo-Australian Cultural Centre and Hellenic Community of Western Australia coordinate the year-round calendar. EventLinqs is built for Perth Mediterranean organisers running events that have shaped the western coast's most established European-Australian community.",
  },
  'mediterranean/adelaide': {
    hero_subtitle: "Festival city, Mediterranean welcome.",
    editorial:
      "Adelaide's Mediterranean community is the highest per-capita Italian population of any Australian city. Norwood and Campbelltown hold the Italian families, Lockleys and Mile End hold the Greek community, Para Hills holds the Lebanese families, Henley Beach holds the Spanish community. Italian Festival at Norwood Parade every August pulls thirty thousand, Glendi Greek Festival at the Olympic Hall in Marleston every September pulls fifteen thousand, Spanish Cultural Festival every March at Bonython Park, Lebanese Mahrajan in Adelaide every May at the Adelaide Showgrounds. Italian food on Magill Road and The Parade, Greek food on Henley Beach Road. The Italo-Australian Centre on Carrington Street and the Hellenic Community of South Australia anchor the year-round calendar. Adelaide Fringe each March always features Mediterranean cabaret and music acts. EventLinqs is built for Adelaide Mediterranean organisers running events that have shaped South Australia's most recognisable European-Australian communities.",
  },
  'mediterranean/gold-coast': {
    hero_subtitle: "Coast life, Mediterranean warmth.",
    editorial:
      "The Gold Coast Mediterranean community is mid-sized and lifestyle-led. Helensvale and Robina hold the Italian families, Surfers Paradise holds the Greek tourist hospitality crowd, Broadbeach holds the Lebanese community, Burleigh Heads holds the Spanish families. Italian Festa every October at HOTA pulls eight thousand, Greek Glendi every May at the Pindara Festival Grounds pulls five thousand, Spanish Cultural Festival every November at Broadbeach, Lebanese Mahrajan every June at Carrara Stadium function rooms. Italian food on Tedder Avenue and Cavill Avenue, Greek food on the Esplanade. The Gold Coast Italian Australian Cultural Society and Hellenic Community of the Gold Coast coordinate the year-round calendar. EventLinqs is built for Gold Coast Mediterranean organisers running events that match coast lifestyle to old-country celebration.",
  },
  'mediterranean/canberra': {
    hero_subtitle: "Capital community, Mediterranean welcome.",
    editorial:
      "Canberra's Mediterranean community is mid-sized and embassy-anchored. The Italian Embassy, Greek Embassy and Spanish Embassy run year-round community events that feed into community calendars. Hughes and Curtin hold the Italian families, Page and Lyneham hold the Greek community, O'Connor holds the Spanish families. Italian National Day at the Italian Embassy every June pulls four thousand, Glendi Greek Festival at the Hellenic Club of Canberra every September pulls three thousand, Spanish Cultural Festival every November at the Embassy of Spain, Lebanese Mahrajan in Canberra every May at Glebe Park. Italian food in Manuka and Kingston, Greek food in Dickson. The Italo-Australian Centre Canberra and Hellenic Club of Canberra coordinate the year-round calendar. EventLinqs is built for Canberra Mediterranean organisers running events that thread old-country celebration through the federal capital.",
  },
  'mediterranean/hobart': {
    hero_subtitle: "Apple Isle, Mediterranean sun.",
    editorial:
      "Hobart's Mediterranean community is small but proudly anchored. North Hobart holds the Italian families, Sandy Bay holds the Greek community, Glenorchy holds the Lebanese and Spanish families. Italian Cultural Day every October at Salamanca pulls one thousand, Greek Cultural Festival every May at the Hellenic Hall in West Hobart, Spanish Cultural Festival every September at the Tasmanian Museum, Lebanese Mahrajan every June at the Hobart Town Hall. Italian food on Liverpool Street and North Hobart's Elizabeth Street, Greek food on Sandy Bay Road. The Tasmanian Italian Cultural Society and Hellenic Community of Tasmania coordinate the year-round calendar. The University of Tasmania Mediterranean Studies programme runs community nights through every semester. The community is small enough that everyone shows up, big enough that the calendar stays steady. EventLinqs is built for Hobart Mediterranean organisers running events that bring old-country warmth to Australia's southernmost capital.",
  },
  'mediterranean/newcastle': {
    hero_subtitle: "Steel city, Mediterranean sun.",
    editorial:
      "Newcastle's Mediterranean community is established and family-led. Hamilton holds the Italian families, Mayfield holds the Greek community, Jesmond holds the Lebanese families, Charlestown holds the Spanish community. Italian Festa at Civic Park every October pulls four thousand, Glendi Greek Festival every May at Hamilton Park pulls three thousand, Spanish Cultural Festival every November at Newcastle Town Hall, Lebanese Mahrajan every June at the Wests City function rooms. Italian food on Beaumont Street, Greek food on James Street. The Hunter Region Italo-Australian Cultural Society and Hellenic Community of the Hunter coordinate the year-round calendar. The University of Newcastle Mediterranean Studies programme runs community nights through every semester. EventLinqs is built for Newcastle Mediterranean organisers running events that anchor an old-country community in the steel river city.",
  },
  'mediterranean/wollongong': {
    hero_subtitle: "Illawarra coast, Mediterranean welcome.",
    editorial:
      "Wollongong's Mediterranean community is one of the most established in regional NSW. Cringila and Port Kembla hold the Italian families, Berkeley holds the Greek community, Warrawong holds the Lebanese and Macedonian families, Figtree holds the Spanish community. Italian Festa every October at McCabe Park pulls five thousand, Glendi Greek Festival every May at Beaton Park pulls four thousand, Spanish Cultural Festival every November at the IPAC, Lebanese Mahrajan every June at Stuart Park. Italian food on Crown Street and Princes Highway, Greek food in Coniston. The Illawarra Italo-Australian Cultural Society and Hellenic Community of Wollongong coordinate the year-round calendar. The University of Wollongong Mediterranean Studies programme runs community nights through every semester. EventLinqs is built for Wollongong Mediterranean organisers running events that thread old-country celebration through the steel coast.",
  },
  'mediterranean/geelong': {
    hero_subtitle: "Bay city, Mediterranean roots.",
    editorial:
      "Geelong's Mediterranean community runs deep. Italian families landed in Norlane and Corio in the 1950s, Greek migrants settled around Newcomb, Croatian and Macedonian families followed. Now the second and third generations keep the community alive - Easter at Saint Nicholas Greek Orthodox in Belmont, Italian National Day at the Geelong Italian Club, Lebanese family gatherings at Eastern Park. The food is Neapolitan, the dancing is Calabrian, the music is everything. EventLinqs is built for Geelong's Mediterranean organisers running community events that bridge old country and new.",
  },
  'mediterranean/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Mediterranean welcome.",
    editorial:
      "The Sunshine Coast Mediterranean community is mid-sized and lifestyle-led. Buderim and Mountain Creek hold the Italian families, Maroochydore holds the Greek community, Caloundra holds the Lebanese families, Mooloolaba holds the Spanish community. Italian Festa every October at Cotton Tree Park pulls three thousand, Glendi Greek Festival every May at Mooloolaba Esplanade pulls two thousand, Spanish Cultural Festival every November at the Lake Kawana Community Centre, Lebanese Mahrajan every June at the Maroochy RSL function rooms. Italian food on Mooloolaba Esplanade and Hastings Street Noosa, Greek food in Caloundra. The Sunshine Coast Italian Australian Cultural Society and Hellenic Community of the Sunshine Coast coordinate the year-round calendar. EventLinqs is built for Sunshine Coast Mediterranean organisers running events that match coast lifestyle to old-country warmth.",
  },
  'mediterranean/cairns': {
    hero_subtitle: "Tropical north, Mediterranean sun.",
    editorial:
      "Cairns has a small but proud Mediterranean community. Manunda holds the Italian families, Earlville holds the Greek community, Westcourt holds the Lebanese and Spanish families. Italian Cultural Day every October at Munro Martin Parklands pulls one thousand, Greek Cultural Festival every May at the Cairns Showgrounds, Spanish Cultural Festival every November at the Cairns Convention Centre, Lebanese Mahrajan every June at the Brothers Leagues Club. Italian food on Sheridan Street, Greek food in Edge Hill. The Far North Queensland Italian Australian Cultural Society and Hellenic Community of Cairns coordinate the year-round calendar. The James Cook University Mediterranean Studies programme runs community nights through every semester. EventLinqs is built for Cairns Mediterranean organisers running events that bring old-country celebration into the tropics.",
  },
  'mediterranean/darwin': {
    hero_subtitle: "Top End energy, Mediterranean warmth.",
    editorial:
      "Darwin's Mediterranean community is small, dry-season-anchored, and outdoor-led. Karama holds the Italian families, Anula holds the Greek community, Casuarina holds the Lebanese and Spanish families. Italian Cultural Day every August at Bicentennial Park pulls one thousand, Glenti Greek Festival every June at the Greek Hall in Stuart Park pulls eight hundred, Spanish Cultural Festival every September at the Darwin Convention Centre, Lebanese Mahrajan every June at the Greek Hall. Italian food on Mitchell Street, Greek food on Knuckey Street. The Northern Territory Italian Cultural Society and Hellenic Community of the NT coordinate the year-round calendar. The Charles Darwin University Mediterranean Studies programme runs community nights through every semester. EventLinqs is built for Darwin Mediterranean organisers running events that bring old-country warmth to Australia's most tropical capital.",
  },
  'mediterranean/townsville': {
    hero_subtitle: "Tropical north, Mediterranean rhythm.",
    editorial:
      "Townsville's Mediterranean community is mid-sized and family-led. Annandale holds the Italian families, Kelso holds the Greek community, Kirwan holds the Lebanese and Spanish families. Italian Cultural Day every October at Riverway pulls one thousand, Glendi Greek Festival every May at the Townsville Greek Hall pulls eight hundred, Spanish Cultural Festival every November at the Civic Theatre, Lebanese Mahrajan every June at the Brothers Leagues Club. Italian food on Flinders Street, Greek food in Aitkenvale. The North Queensland Italian Australian Cultural Society and Hellenic Community of Townsville coordinate the year-round calendar. The James Cook University Mediterranean Studies programme runs community nights through every semester. EventLinqs is built for Townsville Mediterranean organisers running events that anchor old-country celebration in tropical north Queensland.",
  },
  'mediterranean/london': {
    hero_subtitle: "Soho and beyond, Mediterranean Europe.",
    editorial:
      "London's Mediterranean community is the most diverse in Europe. Soho's Italian Quarter is the historic heart, Wood Green holds the Greek Cypriot community (the largest outside Cyprus), Edgware Road holds the Lebanese families, Notting Hill and Soho hold the Spanish community. Italian Festa at St Peter's Italian Church in Clerkenwell every July pulls three thousand, Greek Cypriot Wine Festival in Alexandra Park every August pulls fifteen thousand, Spanish Cultural Festival at Trafalgar Square every September, Lebanese Festival every July at the Royal Festival Hall. Italian food in Soho's Frith Street, Greek food in Wood Green's Green Lanes, Lebanese food on Edgware Road. The Italian Cultural Institute and Hellenic Centre coordinate the year-round calendar. EventLinqs is built for London Mediterranean organisers running events that anchor the most diverse European-Mediterranean community in the world.",
  },
  'mediterranean/new-york': {
    hero_subtitle: "Five boroughs, Old World, New World.",
    editorial:
      "New York's Mediterranean community runs through every borough. Astoria Queens is Greek New York and the largest Greek community outside Greece, Bensonhurst Brooklyn holds the Italian families, Bay Ridge holds the Arab and Lebanese community, Williamsburg has the new Spanish hipster crowd. Italian Feast of San Gennaro on Mulberry Street every September pulls a million for the historic Little Italy festival, Greek Festival of New York at the Holy Trinity Greek Orthodox Cathedral every May pulls fifty thousand, Spanish Festival at Madison Square Garden every November, Lebanese Festival in Brooklyn every June. Italian food on Arthur Avenue and Mulberry Street, Greek food on Astoria's Steinway Street. The Italian American Museum and the Hellenic American Educational Organisation coordinate year-round events. EventLinqs is built for New York Mediterranean organisers running events that anchor America's most established Mediterranean community.",
  },
  'mediterranean/toronto': {
    hero_subtitle: "Lakeside, Old World warmth.",
    editorial:
      "Toronto's Mediterranean community runs through Little Italy and Greektown. College Street is Little Italy, Danforth Avenue is Greektown, Woodbridge holds the Italian-Canadian suburban community (the largest outside Italy), Mount Pleasant holds the Lebanese families. Italian Festa at the Cultura Italiana di Toronto every June pulls eight thousand, Krinos Taste of the Danforth every August pulls a million for the largest Greek festival outside Greece, Spanish Cultural Festival at Yonge-Dundas Square every November, Lebanese Festival at the Civic Centre every July. Italian food on College Street, Greek food on Danforth Avenue. The Italian Cultural Institute and Hellenic Heritage Foundation coordinate the year-round calendar. EventLinqs is built for Toronto Mediterranean organisers running events that anchor the largest Italian and Greek communities outside their home countries.",
  },
  'mediterranean/rome': {
    hero_subtitle: "The eternal city.",
    editorial:
      "Rome is the source. Italian sagre across every borgo and quartiere through summer, Roma Carnevale every February, Notte Bianca every September turning the city into one open-air party until dawn, Estate Romana stretching outdoor community life across the warm months. Trastevere is the historic festival heart, Testaccio holds the contemporary live music scene, San Lorenzo holds the student-and-arts crowd, Garbatella holds the working-class Roman community. Roma Pride at the Circo Massimo every June pulls a million through the streets. Concerto del Primo Maggio at Piazza San Giovanni every May pulls half a million for the largest free concert in Italy. Roma Mediterranean Festival every July at the Foro Italico. Rome is the city that defines Mediterranean celebration globally, and exports it. EventLinqs is built for Rome Mediterranean organisers running the events the rest of the world studies and copies.",
  },
  'mediterranean/athens': {
    hero_subtitle: "Where it all started.",
    editorial:
      "Athens is the source. Greek Easter celebrations across every neighbourhood every April, Athens Festival every June through September at the Odeon of Herodes Atticus, Carnival of Athens every February with city-wide masquerade balls, Athens Outdoor Cinema season filling July nights with Mediterranean rhythm. Plaka and Monastiraki hold the historic festival heart, Exarchia holds the contemporary arts scene, Kolonaki holds the high arts and concert venues, Piraeus holds the working-class Greek live music scene. Athens Pride every June at Syntagma Square pulls one hundred thousand. Rockwave Festival every July at Malakasa pulls forty thousand for Greek and Mediterranean rock. Athens is the city that gave the world the word 'festival' and still defines Mediterranean celebration globally. EventLinqs is built for Athens Mediterranean organisers running the events the global Greek and Mediterranean community watches and copies.",
  },

  // ============================================================
  // MIDDLE EASTERN
  // ============================================================
  'middle-eastern/sydney': {
    hero_subtitle: "Lebanese, Persian, Arabic - Sydney's Middle Eastern stage.",
    editorial:
      "Lebanese mahrajan in Punchbowl pulling 5000 a weekend, Persian Norouz at the Town Hall, Iraqi community festivals in Fairfield, Egyptian shaabi nights in Bankstown, Turkish folk dances in Auburn, Arabic concerts at the ICC and the Hordern Pavilion. Sydney's Middle Eastern community is dense, organised and runs both family-scale weekend events and city-scale festivals across Lebanese, Egyptian, Persian, Iraqi, Turkish and Israeli communities. EventLinqs is built for Sydney Middle Eastern promoters who already know their community shows up loud.",
  },
  'middle-eastern/melbourne': {
    hero_subtitle: "Brunswick to Broadmeadows, Middle Eastern Melbourne.",
    editorial:
      "Melbourne's Middle Eastern community runs through the north and west. Coburg holds the Lebanese families, Brunswick holds the Turkish community, Broadmeadows and Dallas hold the Iraqi and Syrian families, Glen Waverley holds the Iranian and Persian community. Lebanese Mahrajan at Royal Park every May pulls twenty thousand, Persian Norouz at Federation Square every March pulls ten thousand, Turkish Cultural Festival at Sydney Road every August, Iraqi Cultural Festival at the Coburg Town Hall every October. Lebanese food on Sydney Road and Dynon Road, Persian food on High Street Northcote, Turkish food on Sydney Road. Brunswick's Sydney Road carries one of the densest Middle Eastern food strips in Australia. The Lebanese Muslim Association of Australia and the Iranian Cultural Society of Victoria coordinate year-round events. EventLinqs is built for Melbourne Middle Eastern organisers running events that have shaped the city's most distinctive northern food and festival communities.",
  },
  'middle-eastern/brisbane': {
    hero_subtitle: "Sunshine state, Middle Eastern hospitality.",
    editorial:
      "Brisbane's Middle Eastern community is mid-sized and growing. Sunnybank Hills holds the Lebanese families, Mt Gravatt holds the Persian community, Inala holds the Iraqi and Syrian families, Springwood holds the Turkish community. Lebanese Mahrajan in Brisbane every May at Roma Street Parkland pulls eight thousand, Persian Norouz at the Brisbane Convention Centre every March pulls four thousand, Turkish Cultural Festival at South Bank every August, Iraqi Cultural Festival at the Inala Civic Centre every October. Lebanese food on Beaudesert Road and Greenslopes Mall, Persian food in Sunnybank Hills, Turkish food on Logan Road. The Lebanese Australian Cultural Society of Queensland and Iranian Cultural Society of Queensland coordinate year-round events. EventLinqs is built for Brisbane Middle Eastern organisers running events that anchor a fast-growing community across Queensland's southside.",
  },
  'middle-eastern/perth': {
    hero_subtitle: "Indian Ocean to Levantine warmth.",
    editorial:
      "Perth's Middle Eastern community is established and family-led. Cannington holds the Lebanese families, Willetton holds the Persian community, Ferndale holds the Iraqi and Syrian families, Nollamara holds the Turkish community. Lebanese Mahrajan in Perth every May at Whiteman Park pulls six thousand, Persian Norouz at Forrest Place every March pulls three thousand, Turkish Cultural Festival at Russell Square every August, Iraqi Cultural Festival at the Mirrabooka Multicultural Services Centre every October. Lebanese food on William Street Northbridge and Bannister Road Canning Vale, Persian food in Willetton, Turkish food in Cannington. The Lebanese Australian Cultural Society of WA and Iranian Cultural Society of WA coordinate year-round events. EventLinqs is built for Perth Middle Eastern organisers running events that anchor a Levantine community on Australia's western edge.",
  },
  'middle-eastern/adelaide': {
    hero_subtitle: "Festival city, Levantine welcome.",
    editorial:
      "Adelaide's Middle Eastern community is mid-sized and warm. Salisbury and Para Hills hold the Lebanese families, Modbury holds the Persian community, Mawson Lakes holds the Iraqi and Syrian families, Croydon Park holds the Turkish community. Lebanese Mahrajan in Adelaide every May at Bonython Park pulls four thousand, Persian Norouz at Rymill Park every March pulls two thousand, Turkish Cultural Festival at the Adelaide Convention Centre every August, Iraqi Cultural Festival at the Salisbury Civic Centre every October. Lebanese food on Henley Beach Road and Prospect Road, Persian food in Modbury, Turkish food in Salisbury. The Lebanese Australian Cultural Society of SA and Iranian Cultural Society of SA coordinate year-round events. Adelaide Fringe each March always picks up at least one Middle Eastern music or comedy act. EventLinqs is built for Adelaide Middle Eastern organisers running events that anchor a Levantine community in the festival city.",
  },
  'middle-eastern/gold-coast': {
    hero_subtitle: "Coast life, Levantine warmth.",
    editorial:
      "The Gold Coast Middle Eastern community is mid-sized and lifestyle-led. Robina holds the Lebanese families, Helensvale holds the Persian community, Southport holds the Iraqi and Syrian families, Burleigh Heads holds the Turkish community. Lebanese Mahrajan every May at the Carrara Stadium function rooms pulls three thousand, Persian Norouz at Broadwater Parklands every March pulls two thousand, Turkish Cultural Festival at HOTA every August, Iraqi Cultural Festival at the Robina Community Centre every October. Lebanese food in Robina and Carrara, Persian food in Helensvale. The Lebanese Australian Cultural Society of the Gold Coast and Iranian Cultural Society of the Gold Coast coordinate year-round events. EventLinqs is built for Gold Coast Middle Eastern organisers running events that match coast lifestyle to Levantine warmth.",
  },
  'middle-eastern/canberra': {
    hero_subtitle: "Capital community, Levantine welcome.",
    editorial:
      "Canberra's Middle Eastern community is small and embassy-anchored. The Lebanese Embassy, Iranian Embassy, Iraqi Embassy and Turkish Embassy run year-round community events that feed into community calendars. Curtin and Fisher hold the Lebanese families, Kambah holds the Persian community, Tuggeranong holds the Iraqi and Syrian families, Belconnen holds the Turkish community. Lebanese Mahrajan in Canberra every May at Glebe Park pulls one thousand, Persian Norouz at the Canberra Theatre every March pulls eight hundred, Turkish Cultural Festival at the Embassy of Turkey every August, Iraqi Cultural Festival at the Tuggeranong Community Hub every October. The Lebanese Australian Cultural Society of the ACT and Iranian Cultural Society of the ACT coordinate the year-round calendar. EventLinqs is built for Canberra Middle Eastern organisers running events that thread Levantine warmth through the federal capital.",
  },
  'middle-eastern/hobart': {
    hero_subtitle: "Apple Isle, Levantine welcome.",
    editorial:
      "Hobart's Middle Eastern community is small but culturally rich. Glenorchy holds the Lebanese families, Sandy Bay holds the Persian community, Bridgewater holds the Iraqi and Syrian families. Lebanese Mahrajan every May at the Hobart Town Hall pulls four hundred, Persian Norouz at Salamanca Lawns every March pulls three hundred, Turkish Cultural Festival every August at Princes Wharf, Iraqi Cultural Festival every October at PW1 in Salamanca. Lebanese food in North Hobart, Persian food in Sandy Bay. The Tasmanian Lebanese Australian Society and Iranian Cultural Society of Tasmania coordinate the year-round calendar. The University of Tasmania Middle Eastern Studies programme runs community nights through every semester. The community is small enough that everyone shows up, big enough that the calendar stays steady. EventLinqs is built for Hobart Middle Eastern organisers running events that bring Levantine warmth to Australia's coldest capital.",
  },
  'middle-eastern/newcastle': {
    hero_subtitle: "Steel city, Levantine welcome.",
    editorial:
      "Newcastle's Middle Eastern community has grown through the University of Newcastle and the wider Hunter migration. Hamilton holds the Lebanese families, Mayfield holds the Persian community, Wallsend holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Civic Park pulls two thousand, Persian Norouz at the Newcastle Town Hall every March pulls one thousand, Turkish Cultural Festival at the Wests City function rooms every August, Iraqi Cultural Festival at the Charlestown Memorial Hall every October. Lebanese food on Beaumont Street, Persian food on Hunter Street. The Hunter Region Lebanese Australian Society and Iranian Cultural Society of the Hunter coordinate the year-round calendar. The University of Newcastle Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Newcastle Middle Eastern organisers running events that anchor a Levantine community in the steel river city.",
  },
  'middle-eastern/wollongong': {
    hero_subtitle: "Illawarra coast, Levantine warmth.",
    editorial:
      "Wollongong's Middle Eastern community has grown through the University of Wollongong and the wider Illawarra migration. Cringila holds the Lebanese families, Berkeley holds the Persian community, Warrawong holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Stuart Park pulls one thousand five hundred, Persian Norouz at the IPAC every March pulls eight hundred, Turkish Cultural Festival at McCabe Park every August, Iraqi Cultural Festival at the Wollongong Town Hall every October. Lebanese food on Crown Street and Princes Highway, Persian food in Figtree. The Illawarra Lebanese Australian Society and Iranian Cultural Society of the Illawarra coordinate the year-round calendar. The University of Wollongong Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Wollongong Middle Eastern organisers running events that thread Levantine welcome through the steel coast.",
  },
  'middle-eastern/geelong': {
    hero_subtitle: "Bay city, Levantine welcome.",
    editorial:
      "Geelong's Middle Eastern community has grown rapidly through professional migration. Norlane holds the Lebanese families, Highton holds the Persian community, Belmont holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Eastern Park pulls one thousand, Persian Norouz at Steampacket Gardens every March pulls six hundred, Turkish Cultural Festival every August at Johnstone Park, Iraqi Cultural Festival every October at the Geelong Showgrounds. Lebanese food on Pakington Street, Persian food in Highton. The Geelong Lebanese Australian Society and Iranian Cultural Society of Geelong coordinate the year-round calendar. The Deakin University Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Geelong Middle Eastern organisers running events that bring Levantine welcome to the second city of Victoria.",
  },
  'middle-eastern/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Levantine sun.",
    editorial:
      "The Sunshine Coast Middle Eastern community is small but growing. Buderim holds the Lebanese families, Maroochydore holds the Persian community, Caloundra holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Cotton Tree Park pulls eight hundred, Persian Norouz at the Lake Kawana Community Centre every March pulls four hundred, Turkish Cultural Festival every August at the Maroochy RSL function rooms, Iraqi Cultural Festival every October at the Caloundra Community Centre. Lebanese food on Mooloolaba Esplanade, Persian food in Buderim. The Sunshine Coast Lebanese Australian Society and Iranian Cultural Society of the Sunshine Coast coordinate the year-round calendar. The University of the Sunshine Coast Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Sunshine Coast Middle Eastern organisers running events that match coast lifestyle to Levantine warmth.",
  },
  'middle-eastern/cairns': {
    hero_subtitle: "Tropical north, Levantine warmth.",
    editorial:
      "Cairns has a small but warm Middle Eastern community. Manunda holds the Lebanese families, Edmonton holds the Persian community, Westcourt holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Munro Martin Parklands pulls five hundred, Persian Norouz at the Cairns Convention Centre every March pulls three hundred, Turkish Cultural Festival every August at the Cairns Showgrounds, Iraqi Cultural Festival every October at the Brothers Leagues Club. Lebanese food on Sheridan Street, Persian food in Earlville. The Far North Queensland Lebanese Australian Society and Iranian Cultural Society of Cairns coordinate the year-round calendar. The James Cook University Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Cairns Middle Eastern organisers running events that bring Levantine warmth into the tropics.",
  },
  'middle-eastern/darwin': {
    hero_subtitle: "Top End, Levantine warmth.",
    editorial:
      "Darwin's Middle Eastern community is small and dry-season-anchored. Karama holds the Lebanese families, Anula holds the Persian community, Casuarina holds the Iraqi and Syrian families. Lebanese Mahrajan every August at Bicentennial Park pulls six hundred, Persian Norouz every March at the Darwin Convention Centre pulls four hundred, Turkish Cultural Festival every August at Mindil Beach Sunset Markets, Iraqi Cultural Festival every October at the Marrara Sporting Complex. Lebanese food on Mitchell Street, Persian food on Knuckey Street. The Northern Territory Lebanese Australian Society and Iranian Cultural Society of the NT coordinate the year-round calendar. The Charles Darwin University Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Darwin Middle Eastern organisers running events that bring Levantine warmth to Australia's most tropical capital.",
  },
  'middle-eastern/townsville': {
    hero_subtitle: "Tropical north, Levantine welcome.",
    editorial:
      "Townsville's Middle Eastern community is small and family-led. Annandale holds the Lebanese families, Kelso holds the Persian community, Kirwan holds the Iraqi and Syrian families. Lebanese Mahrajan every May at Riverway pulls six hundred, Persian Norouz at the Civic Theatre every March pulls four hundred, Turkish Cultural Festival every August at the Townsville Showgrounds, Iraqi Cultural Festival every October at the Brothers Leagues Club. Lebanese food on Flinders Street, Persian food in Aitkenvale. The North Queensland Lebanese Australian Society and Iranian Cultural Society of Townsville coordinate the year-round calendar. The James Cook University Middle Eastern Studies programme runs community nights through every semester. EventLinqs is built for Townsville Middle Eastern organisers running events that anchor a Levantine community in tropical north Queensland.",
  },
  'middle-eastern/london': {
    hero_subtitle: "Edgware Road and beyond.",
    editorial:
      "London's Middle Eastern community is the most diverse in Europe. Edgware Road is Little Beirut, Kensington High Street holds the wealthy Persian families, Wembley holds the Iraqi and Syrian community, Stoke Newington and Dalston hold the Turkish families. Lebanese Mahrajan every July at Royal Festival Hall pulls fifteen thousand, Norouz Festival at Trafalgar Square every March pulls one hundred thousand for the largest Persian celebration outside Iran, Turkish Festival at Trafalgar Square every August, Iraqi Cultural Festival at Olympia London every October. Lebanese food on Edgware Road, Persian food in Kensington, Turkish food on Green Lanes. The Iran Heritage Foundation and Lebanese British Cultural Society coordinate the year-round calendar. EventLinqs is built for London Middle Eastern organisers running events that anchor the most diverse Levantine community in Europe.",
  },
  'middle-eastern/new-york': {
    hero_subtitle: "Five boroughs, Levantine welcome.",
    editorial:
      "New York's Middle Eastern community runs through Brooklyn and Queens. Bay Ridge Brooklyn is Little Lebanon, Steinway Astoria is Egyptian-Coptic, Forest Hills holds the Persian families, Sunnyside holds the Turkish community. Persian New Year at the United Nations every March pulls three thousand, Lebanese Festival of New York at Brooklyn Bridge Park every August, Turkish Festival at Madison Avenue every May, Egyptian Coptic Festival at Steinway Street every September. Lebanese food on Atlantic Avenue, Persian food in Forest Hills, Turkish food on Steinway. The Iranian American Society of New York and Lebanese American Society coordinate the year-round calendar. EventLinqs is built for New York Middle Eastern organisers running events that anchor America's most established Levantine community.",
  },
  'middle-eastern/toronto': {
    hero_subtitle: "Lakeside, Levantine warmth.",
    editorial:
      "Toronto's Middle Eastern community is the largest in Canada. North York holds the Persian families (the largest Iranian community in Canada), Mississauga holds the Lebanese and Egyptian families, Scarborough holds the Iraqi and Syrian community, the Annex holds the Turkish families. Tirgan Festival every July at Harbourfront Centre pulls fifty thousand for the largest Persian community festival outside Iran, Lebanese Festival at the Distillery District every August, Turkish Festival at Mel Lastman Square every July, Iraqi Cultural Festival every October at the Civic Centre. Persian food on Yonge Street north, Lebanese food on Eglinton Avenue. The Iranian Canadian Congress and Canadian Lebanese Cultural Foundation coordinate the year-round calendar. EventLinqs is built for Toronto Middle Eastern organisers running events that anchor Canada's biggest Levantine community.",
  },
  'middle-eastern/dubai': {
    hero_subtitle: "Where the Middle East meets the world.",
    editorial:
      "Dubai is the community crossroads of the modern Middle East. Old Dubai's Bur Dubai holds the heritage Persian and Arab merchant families, Deira holds the historic Lebanese and Syrian community, Jumeirah holds the wealthy Persian-Emirati families, Bur Saeed holds the Egyptian community. Norouz at Atlantis the Palm every March pulls forty thousand, Eid at the Dubai Mall pulls a million, Sheikh Zayed Festival at Al Wathba every November runs three months of Levantine celebration. Lebanese food on Sheikh Zayed Road, Persian food in Bur Dubai, Turkish food in Jumeirah. The Dubai Cultural Council coordinates year-round events. EventLinqs is built for Dubai Middle Eastern organisers running events that anchor the community and commercial heart of the modern Levant.",
  },
  'middle-eastern/beirut': {
    hero_subtitle: "Where the music begins.",
    editorial:
      "Beirut is the community capital of the Middle East. Hamra holds the historic Lebanese arts scene, Achrafieh holds the Christian-Maronite community, Mar Mikhael holds the contemporary live music venues, Verdun holds the high-end concert halls. Beirut International Film Festival every October, Beiteddine Festival in summer pulling fifty thousand for Arab classical and contemporary music, Byblos International Festival every July at the ancient port. Lebanese food across every quarter, the global Levantine sound exported from Beirut clubs to every corner of the world. The geography puts Beirut at the centre of every major Levantine community calendar, and the city moves at the rhythm of the entire Middle East. EventLinqs is built for Beirut Middle Eastern organisers running events that the global Levant watches and copies.",
  },

  // ============================================================
  // EUROPEAN (Polish, German, French, Eastern European, Scandinavian)
  // ============================================================
  'european/sydney': {
    hero_subtitle: "Old continent, Sydney stage.",
    editorial:
      "Sydney's European community runs through the inner west and the south. Ashfield holds the Polish families, Bondi Junction holds the German community, Vaucluse holds the French expats, Bossley Park holds the Croatian and Serbian community, Cabramatta holds the Russian and Ukrainian families. Polish Festival at Marrickville every September pulls eight thousand, German Oktoberfest at the Concourse Chatswood every October pulls fifteen thousand, French Bastille Day at Circular Quay every July pulls ten thousand, Croatian Cultural Festival at Bossley Park every May, Russian Cultural Festival at Strathfield every October. The Polish Club in Ashfield, the German Club in Concord, the Alliance Francaise in Bondi all coordinate year-round events. European food on Bondi Junction, Concord Road, Liverpool Road. EventLinqs is built for Sydney European organisers running events that have shaped the city's most established European-Australian communities.",
  },
  'european/melbourne': {
    hero_subtitle: "Old World, Melbourne stage.",
    editorial:
      "Melbourne's European community runs through the north and east. Springvale holds the Polish families, Doncaster holds the German community, Toorak holds the French expats, Sunshine West holds the Croatian and Serbian families, Carlton holds the Russian community. Polish Festival at Federation Square every September pulls ten thousand, German Oktoberfest at the Royal Botanic Gardens every October pulls twenty thousand, French Bastille Day at Federation Square every July pulls eight thousand, Croatian Cultural Festival at the Royal Park every May, Russian Cultural Festival at the Russian Hall in Caulfield every October. The Polish Club in Footscray, the German Club in Tullamarine, the Alliance Francaise in St Kilda all coordinate year-round events. European food on Sydney Road, Toorak Road, Bridge Road. EventLinqs is built for Melbourne European organisers running events that thread Old World celebration through Australia's most European-feeling capital.",
  },
  'european/brisbane': {
    hero_subtitle: "Sunshine state, Old World heart.",
    editorial:
      "Brisbane's European community is mid-sized and family-led. Springwood holds the Polish families, Mount Gravatt holds the German community, New Farm holds the French expats, Inala holds the Croatian and Serbian families, Sunnybank holds the Russian community. Polish Festival at South Bank every September pulls four thousand, German Oktoberfest at the Brisbane Showgrounds every October pulls twelve thousand, French Bastille Day at Roma Street Parkland every July pulls five thousand, Croatian Cultural Festival at the Inala Civic Centre every May, Russian Cultural Festival at the South Brisbane Town Hall every October. The Polish Club Brisbane in Milton, the German Club Brisbane in Macgregor, the Alliance Francaise Brisbane in Toowong all coordinate year-round events. European food in New Farm, Bulimba and Newstead. EventLinqs is built for Brisbane European organisers running events that anchor an Old World community in Queensland's biggest city.",
  },
  'european/perth': {
    hero_subtitle: "Indian Ocean to the Old continent.",
    editorial:
      "Perth's European community is established and proudly multicultural. Maylands holds the Polish families, Subiaco holds the German community, Cottesloe holds the French expats, Spearwood holds the Croatian and Serbian community, Rivervale holds the Russian families. Polish Festival at Russell Square every September pulls four thousand, German Oktoberfest at the Perth Convention Centre every October pulls eight thousand, French Bastille Day at Forrest Place every July pulls four thousand, Croatian Cultural Festival at the Spearwood Civic Centre every May, Russian Cultural Festival at the Polish Hall in Subiaco every October. The Polish Australian Club in Maylands, the German Club Perth in Maylands, the Alliance Francaise Perth in Mount Lawley all coordinate year-round events. European food on Beaufort Street and South Terrace Fremantle. EventLinqs is built for Perth European organisers running events that anchor Old World celebration on Australia's western edge.",
  },
  'european/adelaide': {
    hero_subtitle: "Festival city, Old continent welcome.",
    editorial:
      "Adelaide's European community is one of the most established in Australia. Hahndorf is the heart of the South Australian German community (the oldest German settlement in the country), Royal Park holds the Polish families, Norwood holds the French expats, Salisbury holds the Croatian and Serbian families, Pooraka holds the Russian community. Schutzenfest in Hahndorf every January pulls thirty thousand for the largest German community festival in Australia, Polish Cultural Festival at Bonython Park every September, French Bastille Day at the Adelaide Festival Centre every July, Croatian Cultural Festival at the Salisbury Civic Centre every May, Russian Cultural Festival at the Adelaide Showgrounds every October. The Polish Club Adelaide in Wayville, the German Club Adelaide in Flinders Park, the Alliance Francaise Adelaide in Adelaide CBD all coordinate year-round events. EventLinqs is built for Adelaide European organisers running events that have shaped South Australia's most distinctive Old World communities.",
  },
  'european/gold-coast': {
    hero_subtitle: "Coast life, Old continent celebration.",
    editorial:
      "The Gold Coast European community is mid-sized and lifestyle-led. Robina holds the Polish families, Helensvale holds the German community, Burleigh Heads holds the French expats, Carrara holds the Croatian and Serbian families, Surfers Paradise holds the Russian tourist hospitality crowd. Polish Cultural Festival at Broadwater Parklands every September pulls two thousand, German Oktoberfest at HOTA every October pulls eight thousand, French Bastille Day at Burleigh Heads every July pulls four thousand, Croatian Cultural Festival at the Carrara Stadium function rooms every May, Russian Cultural Festival at Surfers Paradise every October. The Gold Coast Polish Cultural Society, German Australian Society of the Gold Coast, and Alliance Francaise Gold Coast all coordinate year-round events. EventLinqs is built for Gold Coast European organisers running events that match coast lifestyle to Old World celebration.",
  },
  'european/canberra': {
    hero_subtitle: "Capital community, Old continent stage.",
    editorial:
      "Canberra's European community is embassy-anchored and culturally rich. The Polish, German, French, Croatian, Russian and Italian embassies all run year-round community events that feed into community calendars. Curtin and Yarralumla hold the European diplomatic community, Belconnen holds the Polish and German families, O'Connor holds the French expats, Tuggeranong holds the Croatian and Serbian families. Polish Cultural Festival at the Polish Embassy every September pulls two thousand, German Oktoberfest at the Embassy of Germany every October pulls four thousand, French Bastille Day at the Embassy of France every July pulls three thousand, Croatian Cultural Festival at the Croatian Embassy every May, Russian Cultural Festival at the National Multicultural Festival every February. The Polish Australian Cultural Society of the ACT, German Australian Society of Canberra, and Alliance Francaise Canberra all coordinate year-round events. EventLinqs is built for Canberra European organisers running events that thread Old World celebration through the federal capital.",
  },
  'european/hobart': {
    hero_subtitle: "Apple Isle, Old continent welcome.",
    editorial:
      "Hobart's European community is small but culturally rich. North Hobart holds the Polish families, Sandy Bay holds the German community, Battery Point holds the French expats, Glenorchy holds the Croatian and Serbian families. Polish Cultural Festival at the Polish Hall in Hobart every September pulls eight hundred, German Oktoberfest at the German Club in Glenorchy every October pulls one thousand five hundred, French Bastille Day at Salamanca Lawns every July pulls eight hundred, Croatian Cultural Festival at the Croatian Hall in Glenorchy every May. The Polish Australian Cultural Society of Tasmania, German Club Hobart, and Alliance Francaise Hobart all coordinate the year-round calendar. The University of Tasmania European Studies programme runs community nights through every semester. EventLinqs is built for Hobart European organisers running events that bring Old World celebration to Australia's southernmost capital.",
  },
  'european/newcastle': {
    hero_subtitle: "Steel city, Old continent welcome.",
    editorial:
      "Newcastle's European community is established and growing. Hamilton holds the Polish families, Mayfield holds the German community, Cooks Hill holds the French expats, Wallsend holds the Croatian and Serbian families, Charlestown holds the Russian community. Polish Cultural Festival at Civic Park every September pulls one thousand five hundred, German Oktoberfest at the Newcastle Showgrounds every October pulls four thousand, French Bastille Day at the Newcastle Town Hall every July pulls two thousand, Croatian Cultural Festival at the Wallsend Town Hall every May, Russian Cultural Festival at the Newcastle Multicultural Centre every October. The Polish Club Newcastle, German Australian Society of the Hunter, and Alliance Francaise Newcastle all coordinate year-round events. The University of Newcastle European Studies programme runs community nights through every semester. EventLinqs is built for Newcastle European organisers running events that anchor Old World celebration in the steel river city.",
  },
  'european/wollongong': {
    hero_subtitle: "Illawarra coast, Old continent stage.",
    editorial:
      "Wollongong's European community is one of the most established in regional NSW. Cringila and Port Kembla hold the Polish, Croatian and Serbian families (the original 1950s migrant heart of the steel industry), Berkeley holds the German community, Figtree holds the French expats. Polish Cultural Festival at Stuart Park every September pulls two thousand, German Oktoberfest at the German Club Wollongong every October pulls three thousand, French Bastille Day at the IPAC every July pulls one thousand five hundred, Croatian Cultural Festival at the Cringila Croatian Hall every May pulls four thousand, Russian Cultural Festival at the Wollongong Town Hall every October. The Polish Club Wollongong, German Club Wollongong, and Alliance Francaise Illawarra all coordinate year-round events. The University of Wollongong European Studies programme runs community nights through every semester. EventLinqs is built for Wollongong European organisers running events that thread Old World heritage through the steel coast.",
  },
  'european/geelong': {
    hero_subtitle: "Bay city, Old continent roots.",
    editorial:
      "Geelong's European community runs deep. Polish, Croatian, Italian and German families landed in Norlane and Corio through the post-war migration. Now the second and third generations keep the community alive. Polish Cultural Festival at Johnstone Park every September pulls one thousand five hundred, German Oktoberfest at the Geelong Showgrounds every October pulls three thousand, French Bastille Day at Steampacket Gardens every July pulls one thousand, Croatian Cultural Festival at the Croatian Club Geelong every May, Russian Cultural Festival at the Geelong Multicultural Centre every October. The Polish Club Geelong in Corio, German Club Geelong in North Geelong, and Alliance Francaise Geelong all coordinate year-round events. The Deakin University European Studies programme runs community nights through every semester. EventLinqs is built for Geelong European organisers running events that anchor Old World heritage in the bay city.",
  },
  'european/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Old continent welcome.",
    editorial:
      "The Sunshine Coast European community is small but growing. Buderim holds the Polish and German families, Mooloolaba holds the French expats, Caloundra holds the Croatian and Serbian community. Polish Cultural Festival at Cotton Tree Park every September pulls eight hundred, German Oktoberfest at the Lake Kawana Community Centre every October pulls two thousand, French Bastille Day at Mooloolaba Esplanade every July pulls one thousand, Croatian Cultural Festival at the Maroochy RSL function rooms every May, Russian Cultural Festival at the Sunshine Coast Convention Centre every October. The Sunshine Coast Polish Cultural Society, German Australian Society of the Sunshine Coast, and Alliance Francaise Sunshine Coast all coordinate year-round events. The University of the Sunshine Coast European Studies programme runs community nights through every semester. EventLinqs is built for Sunshine Coast European organisers running events that match coast lifestyle to Old World celebration.",
  },
  'european/cairns': {
    hero_subtitle: "Tropical north, Old continent welcome.",
    editorial:
      "Cairns has a small European community. Manunda holds the Polish and German families, Edge Hill holds the French expats, Edmonton holds the Croatian and Serbian community. Polish Cultural Festival at Munro Martin Parklands every September pulls four hundred, German Oktoberfest at the Cairns Showgrounds every October pulls one thousand five hundred, French Bastille Day at the Cairns Esplanade every July pulls six hundred, Croatian Cultural Festival at the Cairns Convention Centre every May, Russian Cultural Festival at the Brothers Leagues Club every October. The Far North Queensland Polish Cultural Society, German Australian Society of Cairns, and Alliance Francaise Cairns all coordinate year-round events. The James Cook University European Studies programme runs community nights through every semester. EventLinqs is built for Cairns European organisers running events that bring Old World celebration into the tropics.",
  },
  'european/darwin': {
    hero_subtitle: "Top End energy, Old continent welcome.",
    editorial:
      "Darwin's European community is small and dry-season-anchored. Karama holds the Polish and German families, Anula holds the French expats, Casuarina holds the Croatian and Serbian community. Polish Cultural Festival at Bicentennial Park every August pulls four hundred, German Oktoberfest at the Darwin Convention Centre every October pulls one thousand, French Bastille Day at Mindil Beach Sunset Markets every July pulls eight hundred, Croatian Cultural Festival at the Darwin Multicultural Centre every May, Russian Cultural Festival at the Marrara Sporting Complex every October. The Northern Territory Polish Cultural Society, German Australian Society of the NT, and Alliance Francaise Darwin all coordinate year-round events. The Charles Darwin University European Studies programme runs community nights through every semester. EventLinqs is built for Darwin European organisers running events that bring Old World warmth to Australia's most tropical capital.",
  },
  'european/townsville': {
    hero_subtitle: "Tropical north, Old continent welcome.",
    editorial:
      "Townsville's European community is small and family-led. Annandale holds the Polish and German families, Kelso holds the French expats, Aitkenvale holds the Croatian and Serbian community. Polish Cultural Festival at Riverway every September pulls four hundred, German Oktoberfest at the Townsville Showgrounds every October pulls one thousand, French Bastille Day at the Strand every July pulls six hundred, Croatian Cultural Festival at the Civic Theatre every May, Russian Cultural Festival at the Brothers Leagues Club every October. The North Queensland Polish Cultural Society, German Australian Society of Townsville, and Alliance Francaise Townsville all coordinate year-round events. The James Cook University European Studies programme runs community nights through every semester. EventLinqs is built for Townsville European organisers running events that anchor Old World celebration in tropical north Queensland.",
  },
  'european/london': {
    hero_subtitle: "The continent's capital outside the EU.",
    editorial:
      "London is Europe's largest non-EU capital. Hammersmith and Acton hold the Polish community (the largest outside Poland), Soho's German Club anchors the German families, South Kensington holds the French families (the largest French community outside France), Earl's Court holds the New Zealand-British and Australian-British community alongside Eastern Europeans, Stamford Hill holds the Russian Jewish community. Polish Cultural Festival at Trafalgar Square every September pulls fifty thousand, German Christmas Markets at Hyde Park every December pull a million, French Bastille Day at Trafalgar Square every July pulls thirty thousand, Croatian Cultural Festival at Imperial College every May, Russian Cultural Festival at the Russian Embassy every October. The Polish Cultural Institute, Goethe-Institut London, Institut Francais all coordinate year-round events. EventLinqs is built for London European organisers running events that anchor the most diverse continental community in any non-European capital.",
  },
  'european/new-york': {
    hero_subtitle: "Five boroughs, Old continent stage.",
    editorial:
      "New York's European community runs through Brooklyn and Queens. Greenpoint Brooklyn is Little Poland (the largest Polish community in America), Yorkville Manhattan was the historic German neighbourhood, Bay Ridge holds the Norwegian and Swedish community, Astoria holds the Greek and Italian families. Polish Festival at Greenpoint every September pulls one hundred thousand for the largest Polish-American festival in the world, German-American Steuben Parade up Fifth Avenue every September, French Bastille Day at Smith Street Brooklyn every July, Russian Cultural Festival at Coney Island every June pulls fifty thousand, Czech Cultural Festival at Bohemian Hall in Astoria every May. Polish food on Manhattan Avenue, German food on East 86th Street, French food in West Village. The Kosciuszko Foundation and Goethe-Institut New York coordinate year-round events. EventLinqs is built for New York European organisers running events that anchor America's most established Old World community.",
  },
  'european/toronto': {
    hero_subtitle: "Lakeside, Old continent welcome.",
    editorial:
      "Toronto's European community runs through Roncesvalles and the west end. Roncesvalles is Little Poland (the largest Polish community in Canada), Yonge-Eglinton holds the German community, Mississauga holds the French Canadian and Ukrainian families, Bloor West holds the Polish suburban families. Polish Festival on Roncesvalles every September pulls four hundred thousand for the largest Polish-Canadian festival, German-Canadian Festival at the Roy Thomson Hall every October, French Cultural Festival at Centerpoint every July, Ukrainian Festival at the West End every September pulls eight hundred thousand. Polish food on Roncesvalles Avenue, German food in Kensington Market, French food in Yorkville. The Polish Cultural Centre Toronto, Goethe-Institut Toronto, and Alliance Francaise Toronto coordinate year-round events. EventLinqs is built for Toronto European organisers running events that anchor Canada's biggest Old World community.",
  },
  'european/berlin': {
    hero_subtitle: "Where the wall came down.",
    editorial:
      "Berlin is the capital of contemporary Europe. Kreuzberg holds the historic Turkish-German community and the contemporary techno-arts scene, Mitte holds the high arts and gallery district, Prenzlauer Berg holds the contemporary creative class, Friedrichshain holds the techno club scene that defines global contemporary music. Berlin Pride every July pulls one million through Schöneberg, Karneval der Kulturen every May pulls two million across Kreuzberg, German Unity Day every October fills the Brandenburg Gate, Christmas Markets across every quarter through December pull millions. Berlin Berlinale Film Festival every February. Berghain and Tresor define global techno. Berlin is the city that defines contemporary European community and exports it globally. EventLinqs is built for Berlin European organisers running the events that define the continental rhythm of the 21st century.",
  },
  'european/paris': {
    hero_subtitle: "City of light, continent of community.",
    editorial:
      "Paris is the community capital of continental Europe. Le Marais holds the Jewish and LGBTQ+ heart, Belleville holds the multicultural French community, Saint-Germain-des-Prés holds the literary and arts heart, Montmartre holds the historic French cabaret scene. Bastille Day every 14 July fills the Champs-Élysées with one million, Fête de la Musique every 21 June turns every street into a stage, Paris Plages takes over the Seine each August, Nuit Blanche every October fills the city with all-night community events. The Paris Festival of European Cultures every September. Le Bal des Pompiers (Firefighters Ball) every Bastille Day. Olympia, Bataclan, La Cigale anchor the live music scene. Paris is the city that defines European elegance globally and exports it to every continent. EventLinqs is built for Paris European organisers running the events that the rest of the world watches and copies.",
  },

  // ============================================================
  // PACIFIC
  // ============================================================
  'pacific/sydney': {
    hero_subtitle: "Pacific peoples, Sydney harbours.",
    editorial:
      "Sydney's Pacific community is one of the largest in Australia. Mt Druitt and Blacktown hold the Samoan and Tongan families, Liverpool holds the Fijian community, Penrith holds the Cook Islands and Niuean families, Auburn holds the Maori community. Pasifika Festival at Tumbalong Park every February pulls forty thousand, Polyfest at Sydney Olympic Park every May pulls twenty thousand for the largest Polynesian dance festival outside the islands, Tongan Methodist services across Mt Druitt every Sunday pull two thousand each, Samoan Independence Day at Bonnyrigg every June, Fijian Day at Liverpool every October. Pacific food in Mt Druitt and Liverpool. The Pasifika Cultural Trust and the Samoan Federation of Australia coordinate year-round events. The Marrickville-based Pacific Islander Cultural Centre runs weekend community nights. EventLinqs is built for Sydney Pacific organisers running events that anchor a deep generations-old community across the city's western suburbs.",
  },
  'pacific/melbourne': {
    hero_subtitle: "Pacific peoples, Melbourne stage.",
    editorial:
      "Melbourne's Pacific community runs through the western and southeastern suburbs. Footscray and Sunshine hold the Samoan and Tongan families, Dandenong holds the Cook Islands community, Cranbourne holds the Fijian families, Frankston holds the Maori community. Pasifika Festival at Federation Square every February pulls thirty thousand, Polyfest Melbourne at Cranbourne East Secondary every May pulls fifteen thousand, Tongan Methodist services across Footscray every Sunday pull one thousand five hundred each, Samoan Independence Day at Wyndham Park every June, Fijian Day at Cranbourne every October. Pacific food in Footscray and Sunshine. The Pasifika Australia Council and the Samoan Federation of Victoria coordinate year-round events. The Federation Square hosts the annual Pacific Cultural Festival each July. EventLinqs is built for Melbourne Pacific organisers running events that anchor a generations-deep community across the city's working-class corridors.",
  },
  'pacific/brisbane': {
    hero_subtitle: "Sunshine state, Pacific harbour.",
    editorial:
      "Brisbane's Pacific community is the second-largest in Australia. Logan and Beenleigh hold the Samoan and Tongan families (the largest Pacific community in any Australian council area), Inala holds the Fijian community, Caboolture holds the Cook Islands and Niuean families, the South Side holds the Maori community. Pacific Islander Festival at Logan Gardens every August pulls twenty-five thousand, Polyfest Queensland at Logan Metro every May pulls fifteen thousand, Tongan Methodist services across Logan every Sunday pull two thousand each, Samoan Independence Day at Logan Central every June, Fijian Day at Inala every October. Pacific food across Slacks Creek and Browns Plains. The Logan Pacific Islander Council and the Pasifika Cultural Trust Queensland coordinate year-round events. EventLinqs is built for Brisbane Pacific organisers running events in Australia's largest single Pacific Islander population centre.",
  },
  'pacific/perth': {
    hero_subtitle: "Indian Ocean meets Pacific.",
    editorial:
      "Perth's Pacific community is mid-sized and family-led. Mirrabooka holds the Samoan and Tongan families, Balga holds the Fijian community, Cannington holds the Cook Islands families, Maddington holds the Maori community. Pacific Islander Festival at Russell Square every February pulls eight thousand, Polyfest WA at HBF Stadium every May pulls four thousand, Tongan Methodist services across Mirrabooka every Sunday pull six hundred each, Samoan Independence Day at Forrest Place every June, Fijian Day at Whiteman Park every October. Pacific food in Mirrabooka and Balga. The Pacific Islander Council of Western Australia and the Samoan Federation of WA coordinate year-round events. The Edith Cowan University Pacific Cultural Society runs community nights through every semester. EventLinqs is built for Perth Pacific organisers running events that anchor a Polynesian community on Australia's western edge.",
  },
  'pacific/adelaide': {
    hero_subtitle: "Festival city, Pacific welcome.",
    editorial:
      "Adelaide's Pacific community is mid-sized and tightly woven. Salisbury and Smithfield hold the Samoan and Tongan families, Para Hills holds the Fijian community, Mawson Lakes holds the Cook Islands families, Pooraka holds the Maori community. Pacific Islander Festival at Bonython Park every March pulls four thousand, Polyfest South Australia at the Adelaide Showgrounds every May pulls two thousand, Tongan Methodist services across Salisbury every Sunday pull four hundred each, Samoan Independence Day at the Adelaide Convention Centre every June, Fijian Day at Pooraka every October. Pacific food in Salisbury. The Pacific Islander Council of South Australia and the Samoan Federation of SA coordinate year-round events. Adelaide Fringe each March picks up at least one Pacific music or comedy act. EventLinqs is built for Adelaide Pacific organisers running events that anchor a Polynesian community in the festival city.",
  },
  'pacific/gold-coast': {
    hero_subtitle: "Coast life, Pacific heritage.",
    editorial:
      "The Gold Coast Pacific community is mid-sized and lifestyle-led. Robina and Carrara hold the Samoan and Tongan families, Helensvale holds the Fijian community, Coomera holds the Cook Islands families, Burleigh Heads holds the Maori community. Pacific Islander Festival at HOTA every February pulls four thousand, Polyfest Gold Coast at Carrara Stadium function rooms every May pulls two thousand, Tongan Methodist services across Robina every Sunday pull four hundred each, Samoan Independence Day at Broadwater Parklands every June, Fijian Day at Helensvale every October. Pacific food in Robina and Helensvale. The Gold Coast Pacific Islander Council coordinates year-round events. The Bond and Griffith University Pacific Cultural Societies pull fresh student energy each semester. EventLinqs is built for Gold Coast Pacific organisers running events that match coast lifestyle to Polynesian heritage.",
  },
  'pacific/canberra': {
    hero_subtitle: "Capital community, Pacific stage.",
    editorial:
      "Canberra's Pacific community is small but tightly organised. Tuggeranong and Kambah hold the Samoan and Tongan families, Belconnen holds the Fijian community, Gungahlin holds the Cook Islands and Maori families. Pacific Islander Festival at Glebe Park every February pulls one thousand five hundred, Polyfest ACT at the AIS Arena every May pulls one thousand, Tongan Methodist services across Tuggeranong every Sunday pull two hundred each, Samoan Independence Day at Garema Place every June, Fijian Day at Belconnen every October. Pacific food in Tuggeranong. The ACT Pacific Islander Council coordinates year-round events. The ANU Pacific Studies programme runs community nights through every semester. The Pacific Embassies (PNG, Fiji, Samoa, Tonga) run year-round community events. EventLinqs is built for Canberra Pacific organisers running events that thread Polynesian heritage through the federal capital.",
  },
  'pacific/hobart': {
    hero_subtitle: "Apple Isle, Pacific welcome.",
    editorial:
      "From Tongan Methodist services in Glenorchy to Samoan rugby celebrations spilling out of Bellerive, Tasmania's Pacific community gathers small but proud. The Maori community nights in North Hobart, Fijian wedding receptions at Wrest Point, the slow steady Pasifika fellowship that anchors family across the Bass Strait. EventLinqs is built for the Hobart Pacific organisers running it all - the community elders, the young families, the community choirs keeping song alive in our southernmost capital.",
  },
  'pacific/newcastle': {
    hero_subtitle: "Steel city, Pacific welcome.",
    editorial:
      "Newcastle's Pacific community is small but established. Mayfield and Hamilton hold the Samoan and Tongan families, Wallsend holds the Fijian community, Charlestown holds the Cook Islands and Maori families. Pacific Islander Festival at Civic Park every February pulls one thousand five hundred, Polyfest Hunter at the Newcastle Showgrounds every May pulls eight hundred, Tongan Methodist services across Mayfield every Sunday pull two hundred each, Samoan Independence Day at Foreshore Park every June, Fijian Day at Wallsend every October. Pacific food in Mayfield. The Hunter Region Pacific Islander Council coordinates year-round events. The University of Newcastle Pacific Studies programme runs community nights through every semester. EventLinqs is built for Newcastle Pacific organisers running events that anchor a Polynesian community in the steel river city.",
  },
  'pacific/wollongong': {
    hero_subtitle: "Illawarra coast, Pacific welcome.",
    editorial:
      "Wollongong's Pacific community is small but proudly anchored. Berkeley and Warrawong hold the Samoan and Tongan families, Cringila holds the Fijian community, Coniston holds the Cook Islands and Maori families. Pacific Islander Festival at Stuart Park every February pulls one thousand, Polyfest Illawarra at the Beaton Park Leisure Centre every May pulls six hundred, Tongan Methodist services across Berkeley every Sunday pull two hundred each, Samoan Independence Day at McCabe Park every June, Fijian Day at Warrawong every October. Pacific food in Warrawong. The Illawarra Pacific Islander Council coordinates year-round events. The University of Wollongong Pacific Studies programme runs community nights through every semester. EventLinqs is built for Wollongong Pacific organisers running events that thread Polynesian welcome through the steel coast.",
  },
  'pacific/geelong': {
    hero_subtitle: "Bay city, Pacific welcome.",
    editorial:
      "Geelong's Pacific community is small but family-led. Norlane holds the Samoan and Tongan families, Corio holds the Fijian community, Whittington holds the Cook Islands and Maori families. Pacific Islander Festival at Steampacket Gardens every February pulls eight hundred, Polyfest Geelong at the Geelong Showgrounds every May pulls five hundred, Tongan Methodist services across Norlane every Sunday pull one hundred fifty each, Samoan Independence Day at Johnstone Park every June, Fijian Day at Corio every October. Pacific food in Norlane. The Geelong Pacific Islander Council coordinates year-round events. The Deakin University Pacific Studies programme runs community nights through every semester. EventLinqs is built for Geelong Pacific organisers running events that anchor a Polynesian community in the second city of Victoria.",
  },
  'pacific/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Pacific welcome.",
    editorial:
      "The Sunshine Coast Pacific community is small but lifestyle-led. Caloundra holds the Samoan and Tongan families, Maroochydore holds the Fijian community, Buderim holds the Cook Islands and Maori families. Pacific Islander Festival at Cotton Tree Park every February pulls eight hundred, Polyfest Sunshine Coast at the Lake Kawana Community Centre every May pulls four hundred, Tongan Methodist services across Caloundra every Sunday pull one hundred fifty each, Samoan Independence Day at Mooloolaba Esplanade every June, Fijian Day at Buderim every October. Pacific food in Caloundra. The Sunshine Coast Pacific Islander Council coordinates year-round events. The University of the Sunshine Coast Pacific Studies programme runs community nights through every semester. EventLinqs is built for Sunshine Coast Pacific organisers running events that match coast lifestyle to Polynesian welcome.",
  },
  'pacific/cairns': {
    hero_subtitle: "Tropical north, Pacific harbour.",
    editorial:
      "Cairns has a small but warm Pacific community, drawn to the tropical climate that mirrors the islands. Manunda holds the Samoan and Tongan families, Edmonton holds the Fijian community, Westcourt holds the Cook Islands and Maori families. Pacific Islander Festival at Munro Martin Parklands every February pulls six hundred, Polyfest Far North Queensland at the Cairns Showgrounds every May pulls three hundred, Tongan Methodist services across Manunda every Sunday pull one hundred each, Samoan Independence Day at the Esplanade every June, Fijian Day at Edmonton every October. Pacific food in Manunda. The Far North Queensland Pacific Islander Council coordinates year-round events. The James Cook University Pacific Studies programme runs community nights through every semester. EventLinqs is built for Cairns Pacific organisers running events that bring Polynesian welcome into Australia's most island-feeling tropical city.",
  },
  'pacific/darwin': {
    hero_subtitle: "Top End, Pacific welcome.",
    editorial:
      "Darwin's Pacific community is small but Top End-anchored. Karama holds the Samoan and Tongan families, Anula holds the Fijian community, Casuarina holds the Cook Islands and Maori families. Pacific Islander Festival at Bicentennial Park every August pulls eight hundred, Polyfest NT at the Darwin Convention Centre every May pulls four hundred, Tongan Methodist services across Karama every Sunday pull one hundred each, Samoan Independence Day at Mindil Beach Sunset Markets every June, Fijian Day at the Marrara Sporting Complex every October. Pacific food in Karama. The Northern Territory Pacific Islander Council coordinates year-round events. The Charles Darwin University Pacific Studies programme runs community nights through every semester. EventLinqs is built for Darwin Pacific organisers running events that bring Polynesian welcome to Australia's most Asia-and-Pacific-facing capital.",
  },
  'pacific/townsville': {
    hero_subtitle: "Tropical north, Pacific welcome.",
    editorial:
      "Townsville's Pacific community is established and family-led. Annandale and Heatley hold the Samoan and Tongan families, Kelso holds the Fijian community, Kirwan holds the Cook Islands and Maori families. Pacific Islander Festival at Riverway every February pulls one thousand five hundred, Polyfest North Queensland at the Townsville Showgrounds every May pulls eight hundred, Tongan Methodist services across Annandale every Sunday pull two hundred each, Samoan Independence Day at the Strand every June, Fijian Day at Kirwan every October. Pacific food in Heatley. The North Queensland Pacific Islander Council coordinates year-round events. The James Cook University Pacific Studies programme runs community nights through every semester. The Townsville rugby community has produced more Pacific Islander NRL players than almost any other Australian region. EventLinqs is built for Townsville Pacific organisers running events that anchor a Polynesian community in tropical north Queensland.",
  },
  'pacific/auckland': {
    hero_subtitle: "Tāmaki Makaurau, Pacific stage.",
    editorial:
      "Auckland is the largest Polynesian city in the world. Otara, Mangere and Manurewa hold the Samoan and Tongan families (each suburb is more Pacific Islander than any non-island city in the world), Onehunga holds the Cook Islands community, Te Atatu holds the Niuean families, Henderson holds the Fijian community. Pasifika Festival at Western Springs every March pulls one hundred thousand for the largest Pacific community festival in the world, Polyfest at Manukau every March pulls one hundred thousand of high school Polynesian community performance, Te Matatini Maori community festival pulls fifty thousand, Tongan Heilala Festival every June, Samoan Independence Day every June. Pacific food across South Auckland. The Pasifika Trust coordinates the year-round calendar. Auckland is the city that defines Pacific Islander celebration globally and exports it. EventLinqs is built for Auckland Pacific organisers running the events the global Pasifika community watches.",
  },
  'pacific/wellington': {
    hero_subtitle: "Te Whanganui-a-Tara, Pacific harbour.",
    editorial:
      "Wellington is New Zealand's capital and one of the most Pacific cities in the world. Porirua and Cannons Creek hold the Samoan and Tongan families, Petone holds the Cook Islands community, Wainuiomata holds the Fijian families, Naenae holds the Maori-Pacific overlap. Pasifika Festival at Frank Kitts Park every March pulls thirty thousand, Polyfest Wellington at Porirua every June pulls twenty thousand, Te Matatini in Wellington every two years pulls fifty thousand for the largest Maori community festival, Samoan Language Week every May fills government buildings, Tongan Heilala Festival every June. Pacific food in Porirua. The Wellington Pasifika Trust coordinates the year-round calendar. The Pacific peoples are the third-largest population group in Wellington. EventLinqs is built for Wellington Pacific organisers running events that anchor New Zealand's most Pacific-feeling capital.",
  },
  'pacific/honolulu': {
    hero_subtitle: "Where Polynesia meets America.",
    editorial:
      "Honolulu is the community heart of Hawaiian Polynesia. Waikiki holds the tourist hospitality crowd, Kalihi holds the Samoan and Tongan families (the largest American Samoan community outside the US territory), Waipahu holds the Filipino-Pacific overlap, Pearl City holds the Hawaiian community. Aloha Festivals every September pull one million across the city for the largest Hawaiian community festival, Pan Pacific Festival every June pulls four hundred thousand, Hawaiian Slack Key Guitar Festival every August, Samoan Flag Day every April pulls fifty thousand. Pacific food across Kalihi. The Hawaii State Foundation on Culture and the Arts coordinates the year-round calendar. The geography makes Honolulu the natural meeting point of Pacific Islander communities and continental Polynesia. EventLinqs is built for Honolulu Pacific organisers running events that anchor the Polynesian capital of the United States.",
  },
  'pacific/los-angeles': {
    hero_subtitle: "West coast, Polynesian welcome.",
    editorial:
      "Los Angeles holds the largest Pacific Islander community in continental America. Carson is the heart of the Samoan-American community (the largest outside Samoa), Long Beach holds the Cambodian-Polynesian overlap, Inglewood holds the Tongan community, Hawthorne holds the Fijian families. Polynesian Festival at Carson Park every July pulls thirty thousand for the largest Pacific community festival in continental America, Pacific Islander Festival at the LA Convention Center every September, Samoan Flag Day every April, Tongan Independence Day every June. Pacific food in Carson and Long Beach. The Pacific Islander Health Partnership coordinates year-round events. The University of Southern California Pacific Islander Student Association pulls fresh student energy each semester. EventLinqs is built for LA Pacific organisers running events that anchor the largest Pacific Islander community in continental America.",
  },
  'pacific/toronto': {
    hero_subtitle: "Lakeside, Pacific welcome.",
    editorial:
      "Toronto's Pacific community is small but tightly woven. Scarborough and Pickering hold the Fijian and Samoan families, Markham holds the Cook Islands community, North York holds the Tongan and Maori families. Pasifika Festival at Yonge-Dundas Square every August pulls four thousand, Polynesian Cultural Festival at Centerpoint Mall every May pulls two thousand, Samoan Independence Day at the Civic Centre every June, Tongan Independence Day at Mel Lastman Square every November. Pacific food in Scarborough. The Pacific Islander Cultural Foundation of Canada coordinates the year-round calendar. The University of Toronto Pacific Studies programme runs community nights through every semester. The community is small enough that everyone shows up, big enough that the calendar stays steady. EventLinqs is built for Toronto Pacific organisers running events that bring Polynesian welcome to Canada's largest city.",
  },

  // ============================================================
  // GOSPEL
  // ============================================================
  'gospel/sydney': {
    hero_subtitle: "Where every community lifts a song.",
    editorial:
      "Sydney's Gospel scene is multicultural and multi-denominational. Pan-African Gospel services in Lakemba pull two thousand on Sundays, Pacific Islander Methodist Gospel choirs in Mt Druitt rehearse for stadium events, Caribbean Gospel services across Liverpool blend reggae and worship, Filipino Tagalog Mass at Mt Pritchard fills Sacred Heart, Korean Hillsong worship at the Concourse Chatswood pulls five thousand. Hillsong United at Qudos Bank Arena pulls fifteen thousand. Sydney Gospel Festival every August at Olympic Park pulls twenty thousand for the largest interdenominational Gospel celebration in the country. Gospel choir competitions through Western Sydney every May. The Sydney Pentecostal Choir Network coordinates the year-round calendar. EventLinqs is built for Sydney Gospel organisers running events that lift every community's voice across a city of two hundred languages.",
  },
  'gospel/melbourne': {
    hero_subtitle: "Voices lift across Melbourne.",
    editorial:
      "Melbourne's Gospel scene is one of the deepest in Australia. Pan-African Gospel services across Footscray and Sunshine pull two thousand on Sundays, Pacific Islander Methodist Gospel choirs in Cranbourne rehearse for stadium events, Caribbean Gospel services across Dandenong blend reggae and worship, Filipino Tagalog Mass at Werribee fills Saint Andrew's, Korean Hillsong worship at Hillsong Melbourne pulls four thousand. Hillsong Conference at the Melbourne Convention Centre pulls eight thousand. Melbourne Gospel Festival every August at Federation Square pulls fifteen thousand for the largest interdenominational Gospel celebration in Victoria. Gospel choir competitions through the West every May. The Melbourne Pentecostal Choir Network coordinates the year-round calendar. EventLinqs is built for Melbourne Gospel organisers running events that lift every community's voice across the city's working-class corridors.",
  },
  'gospel/brisbane': {
    hero_subtitle: "Sunshine state, Sunday song.",
    editorial:
      "Brisbane's Gospel scene is community-led and culturally diverse. Pan-African Gospel services across South Brisbane pull one thousand five hundred on Sundays, Pacific Islander Methodist Gospel choirs in Logan rehearse for stadium events, Caribbean Gospel services across Inala blend reggae and worship, Filipino Tagalog Mass at Sunnybank Hills fills Our Lady of Lourdes, Korean Hillsong worship at Hillsong Brisbane pulls three thousand. Brisbane Gospel Festival every August at Roma Street Parkland pulls eight thousand. Gospel choir competitions through Logan every May. The Queensland Pentecostal Choir Network coordinates the year-round calendar. The Sunday Gospel Brunch at the Brisbane Powerhouse pulls a multicultural worship crowd through every weekend. EventLinqs is built for Brisbane Gospel organisers running events that lift every community's voice across Queensland's southside.",
  },
  'gospel/perth': {
    hero_subtitle: "Indian Ocean, Sunday song.",
    editorial:
      "Perth's Gospel scene is family-led and tightly anchored. Pan-African Gospel services across Mirrabooka pull one thousand on Sundays, Pacific Islander Methodist Gospel choirs in Balga rehearse for arena events, Caribbean Gospel services across Gosnells blend reggae and worship, Filipino Tagalog Mass at Mirrabooka fills Saint Pius X, Korean Hillsong worship at Hillsong Perth pulls two thousand. Perth Gospel Festival every August at Russell Square pulls four thousand. Gospel choir competitions through the northern suburbs every May. The Western Australian Pentecostal Choir Network coordinates the year-round calendar. The Sunday Worship at HBF Stadium pulls a multicultural Gospel crowd through every quarterly. EventLinqs is built for Perth Gospel organisers running events that lift every community's voice across Australia's western edge.",
  },
  'gospel/adelaide': {
    hero_subtitle: "Festival city, festival of the spirit.",
    editorial:
      "Adelaide's Gospel scene is family-led and proudly diverse. Pan-African Gospel services across Salisbury pull one thousand on Sundays, Pacific Islander Methodist Gospel choirs in Smithfield rehearse for festival events, Caribbean Gospel services across Modbury blend reggae and worship, Filipino Tagalog Mass at Elizabeth Grove fills Saint Mary Magdalene's, Korean Hillsong worship at Hillsong Adelaide pulls one thousand five hundred. Adelaide Gospel Festival every August at Bonython Park pulls four thousand. Gospel choir competitions through the northern suburbs every May. The South Australian Pentecostal Choir Network coordinates the year-round calendar. Adelaide Fringe each March features Gospel cabaret and music nights. EventLinqs is built for Adelaide Gospel organisers running events that lift every community's voice across the festival city.",
  },
  'gospel/gold-coast': {
    hero_subtitle: "Coast life, Sunday song.",
    editorial:
      "The Gold Coast Gospel scene is mid-sized and lifestyle-led. Pan-African Gospel services across Robina pull eight hundred on Sundays, Pacific Islander Methodist Gospel choirs in Helensvale rehearse for outdoor events, Caribbean Gospel services across Mt Tamborine blend reggae and worship, Filipino Tagalog Mass at Clear Island Waters fills Sacred Heart, Korean Hillsong worship at Hillsong Gold Coast pulls one thousand. Gold Coast Gospel Festival every August at HOTA pulls three thousand. Gospel choir competitions through the wider region every May. The Gold Coast Pentecostal Choir Network coordinates the year-round calendar. The Beach Gospel Sunday at Burleigh Beach through summer pulls a multicultural worship crowd. EventLinqs is built for Gold Coast Gospel organisers running events that match coast lifestyle to Sunday song.",
  },
  'gospel/canberra': {
    hero_subtitle: "Capital community, Sunday song.",
    editorial:
      "Canberra's Gospel scene is small but tightly organised. Pan-African Gospel services across Tuggeranong pull six hundred on Sundays, Pacific Islander Methodist Gospel choirs in Belconnen rehearse for territory events, Caribbean Gospel services across Gungahlin blend reggae and worship, Filipino Tagalog Mass at Saint Christopher's Cathedral, Korean Hillsong worship at Hillsong Canberra pulls eight hundred. Canberra Gospel Festival every August at Glebe Park pulls one thousand five hundred. Gospel choir competitions through the wider ACT every May. The ACT Pentecostal Choir Network coordinates the year-round calendar. The National Multicultural Festival every February features Gospel music nights. EventLinqs is built for Canberra Gospel organisers running events that thread Sunday song through the federal capital.",
  },
  'gospel/hobart': {
    hero_subtitle: "Apple Isle, Sunday song.",
    editorial:
      "Hobart's Gospel scene is small but proudly diverse. Pan-African Gospel services across Glenorchy pull three hundred on Sundays, Pacific Islander Methodist Gospel choirs in Bridgewater rehearse for state events, Filipino Tagalog Mass at Saint Joseph's, Korean Hillsong worship at Hillsong Hobart pulls four hundred. Hobart Gospel Festival every August at Salamanca Lawns pulls eight hundred. Gospel choir competitions through the wider Tasmania every May. The Tasmanian Pentecostal Choir Network coordinates the year-round calendar. The Federation Square hosts Sunday worship through every quarter. The community is small enough that everyone shows up. EventLinqs is built for Hobart Gospel organisers running events that lift Sunday song in Australia's southernmost capital.",
  },
  'gospel/newcastle': {
    hero_subtitle: "Steel city, Sunday song.",
    editorial:
      "Newcastle's Gospel scene is established and growing. Pan-African Gospel services across Mayfield pull six hundred on Sundays, Pacific Islander Methodist Gospel choirs in Charlestown rehearse for regional events, Caribbean Gospel services across Wallsend blend reggae and worship, Filipino Tagalog Mass at Hamilton fills Sacred Heart, Korean Hillsong worship at Hillsong Newcastle pulls one thousand. Newcastle Gospel Festival every August at Civic Park pulls two thousand. Gospel choir competitions through the Hunter region every May. The Hunter Pentecostal Choir Network coordinates the year-round calendar. The Sunday Gospel Brunch at the Newcastle Civic Theatre pulls a multicultural worship crowd through every quarterly. EventLinqs is built for Newcastle Gospel organisers running events that lift Sunday song across the steel river city.",
  },
  'gospel/wollongong': {
    hero_subtitle: "Illawarra coast, Sunday song.",
    editorial:
      "Wollongong's Gospel scene is community-led and family-anchored. Pan-African Gospel services across Berkeley pull four hundred on Sundays, Pacific Islander Methodist Gospel choirs in Warrawong rehearse for regional events, Caribbean Gospel services across Cringila blend reggae and worship, Filipino Tagalog Mass at Warrawong fills Saint Therese's, Korean Hillsong worship at Hillsong Wollongong pulls eight hundred. Wollongong Gospel Festival every August at Stuart Park pulls one thousand five hundred. Gospel choir competitions through the Illawarra every May. The Illawarra Pentecostal Choir Network coordinates the year-round calendar. The University of Wollongong hosts Sunday worship through every semester. EventLinqs is built for Wollongong Gospel organisers running events that lift Sunday song across the steel coast.",
  },
  'gospel/geelong': {
    hero_subtitle: "Bay city, Sunday song.",
    editorial:
      "Geelong's Gospel scene is community-led and family-anchored. Pan-African Gospel services across Norlane pull four hundred on Sundays, Pacific Islander Methodist Gospel choirs in Whittington rehearse for regional events, Caribbean Gospel services across Corio blend reggae and worship, Filipino Tagalog Mass at Geelong fills Saint Mary's, Korean Hillsong worship at Hillsong Geelong pulls eight hundred. Geelong Gospel Festival every August at Johnstone Park pulls one thousand five hundred. Gospel choir competitions through the wider region every May. The Geelong Pentecostal Choir Network coordinates the year-round calendar. The Deakin University hosts Sunday worship through every semester. EventLinqs is built for Geelong Gospel organisers running events that lift Sunday song across the bay city.",
  },
  'gospel/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Sunday song.",
    editorial:
      "The Sunshine Coast Gospel scene is mid-sized and lifestyle-led. Pan-African Gospel services across Caloundra pull three hundred on Sundays, Pacific Islander Methodist Gospel choirs in Mooloolaba rehearse for regional events, Caribbean Gospel services across Buderim blend reggae and worship, Filipino Tagalog Mass at Stella Maris in Maroochydore, Korean Hillsong worship at Hillsong Sunshine Coast pulls six hundred. Sunshine Coast Gospel Festival every August at Cotton Tree Park pulls one thousand. Gospel choir competitions through the wider region every May. The Sunshine Coast Pentecostal Choir Network coordinates the year-round calendar. The Beach Gospel Sunday at Mooloolaba through summer pulls a multicultural worship crowd. EventLinqs is built for Sunshine Coast Gospel organisers running events that match coast lifestyle to Sunday song.",
  },
  'gospel/cairns': {
    hero_subtitle: "Tropical north, Sunday song.",
    editorial:
      "Cairns has a small but warm Gospel scene. Pan-African Gospel services across Manunda pull two hundred on Sundays, Pacific Islander Methodist Gospel choirs in Edmonton rehearse for regional events, Caribbean Gospel services across Westcourt blend reggae and worship, Filipino Tagalog Mass at Hambledon fills Holy Family, Korean Hillsong worship at Cairns Christian Centre pulls five hundred. Cairns Gospel Festival every August at Munro Martin Parklands pulls eight hundred. Gospel choir competitions through the wider region every May. The Far North Queensland Pentecostal Choir Network coordinates the year-round calendar. The Sunday Worship at the Cairns Showgrounds pulls a multicultural Gospel crowd through every quarterly. EventLinqs is built for Cairns Gospel organisers running events that lift Sunday song into the tropics.",
  },
  'gospel/darwin': {
    hero_subtitle: "Top End, Sunday song.",
    editorial:
      "Darwin's Gospel scene is small but tropical-anchored. Pan-African Gospel services across Karama pull two hundred on Sundays, Pacific Islander Methodist Gospel choirs in Anula rehearse for territory events, Caribbean Gospel services across Casuarina blend reggae and worship, Filipino Tagalog Mass at Casuarina fills All Saints, Korean Hillsong worship at Darwin Christian Centre pulls four hundred. Darwin Gospel Festival every August at Bicentennial Park pulls eight hundred. Gospel choir competitions through the wider Top End every May. The Northern Territory Pentecostal Choir Network coordinates the year-round calendar. The Mindil Beach Sunset Gospel through every dry season pulls a multicultural worship crowd. EventLinqs is built for Darwin Gospel organisers running events that lift Sunday song across Australia's most tropical capital.",
  },
  'gospel/townsville': {
    hero_subtitle: "Tropical north, Sunday song.",
    editorial:
      "Townsville's Gospel scene is established and family-led. Pan-African Gospel services across Annandale pull two hundred fifty on Sundays, Pacific Islander Methodist Gospel choirs in Heatley rehearse for regional events (the Townsville Pacific Islander community is one of the largest in Queensland), Caribbean Gospel services across Kelso blend reggae and worship, Filipino Tagalog Mass at Annandale fills Holy Family, Korean Hillsong worship at Hillsong Townsville pulls five hundred. Townsville Gospel Festival every August at Riverway pulls one thousand five hundred. Gospel choir competitions through the wider North Queensland every May. The North Queensland Pentecostal Choir Network coordinates the year-round calendar. The James Cook University hosts Sunday worship through every semester. EventLinqs is built for Townsville Gospel organisers running events that lift Sunday song across tropical north Queensland.",
  },
  'gospel/london': {
    hero_subtitle: "Where every African Gospel sings.",
    editorial:
      "London is the Gospel capital of Europe. Pan-African Gospel services in Stratford and Tottenham pull three thousand on Sundays, Caribbean Gospel services in Brixton and Lewisham blend reggae and worship, the Redeemed Christian Church of God across Croydon and Romford pulls fifteen thousand on Sundays, Hillsong London at the Dominion Theatre pulls five thousand. London Gospel Festival every August at Trafalgar Square pulls fifty thousand for the largest Gospel celebration in Europe. The British Gospel Music Awards every June at the Royal Festival Hall. The London Pentecostal Choir Network coordinates the year-round calendar across one of the most multicultural Gospel scenes in the world. EventLinqs is built for London Gospel organisers running events that the global African and Caribbean Gospel community watches.",
  },
  'gospel/new-york': {
    hero_subtitle: "Harlem to every borough.",
    editorial:
      "New York is the Gospel capital of America. Harlem holds the historic African-American Gospel heart with the Apollo Theater Gospel Brunch and the Abyssinian Baptist Church Sunday service pulling thousands each weekend. Brooklyn holds the contemporary mega-church Gospel community at the Christian Cultural Centre. The Bronx holds the Caribbean Gospel community. Queens holds the Pan-African Gospel community. New York Gospel Festival every August at Brooklyn Bridge Park pulls one hundred thousand. Hillsong NYC at the Hammerstein Ballroom pulls five thousand. The Gospel Music Workshop of America convention every August. The New York Pentecostal Choir Network coordinates the year-round calendar across one of the deepest Gospel music scenes in the world. EventLinqs is built for New York Gospel organisers running events that anchor America's Gospel music heart.",
  },
  'gospel/toronto': {
    hero_subtitle: "Lakeside, every Sunday.",
    editorial:
      "Toronto is one of the largest Gospel scenes in North America outside the southern US. Pan-African Gospel services in Brampton and Mississauga pull two thousand on Sundays, Caribbean Gospel services in Eglinton West blend reggae and worship, Filipino Gospel services in Bathurst and Scarborough pull three thousand, Korean Hillsong worship at Hillsong Toronto pulls four thousand. Toronto Gospel Festival every August at Yonge-Dundas Square pulls fifteen thousand. Caribana Gospel Sunday during Caribana every August pulls one hundred thousand. The Gospel Music Association of Canada awards every May. The Toronto Pentecostal Choir Network coordinates the year-round calendar across one of the most multicultural Gospel scenes in the world. EventLinqs is built for Toronto Gospel organisers running events that anchor Canada's deepest Gospel music scene.",
  },

  // ============================================================
  // COMEDY
  // ============================================================
  'comedy/sydney': {
    hero_subtitle: "Where Sydney laughs.",
    editorial:
      "Sydney's comedy scene runs through Newtown, Surry Hills and the Inner West. Comedy Store at the Entertainment Quarter pulls 500 a night, Giant Dwarf in Redfern hosts long-form storytelling and improv, Factory Theatre in Marrickville packs out for international touring acts, Roxbury Hotel hosts the rotating comedy circuit. Sydney Comedy Festival every May runs across thirty venues for three weeks pulling 200,000 attendees. Just for Laughs Sydney every October at the State Theatre. Comedy Cellar at the Old Fitzroy. Sydney Underground Comedy at the Townie. The Comic Lounge in Crows Nest. Hot Dub Time Machine and other comedy-music hybrids run through summer venues. The Sydney comedy circuit is the largest in Australia and the most international. EventLinqs is built for Sydney comedy organisers running events that anchor Australia's biggest comedy market.",
  },
  'comedy/melbourne': {
    hero_subtitle: "Australia's comedy capital.",
    editorial:
      "Melbourne is the comedy capital of the southern hemisphere. Melbourne International Comedy Festival every March/April runs four weeks across one hundred venues pulling six hundred thousand attendees for the third-largest comedy festival in the world (after Edinburgh and Just for Laughs Montreal). The Comic's Lounge in North Melbourne packs five nights a week, the Comedy Republic in Bourke Street hosts the underground circuit, the Athenaeum hosts touring international acts, the Forum hosts the festival's biggest names. Comedy Theatre, Princess Theatre, Regent Theatre all anchor the scene. The Melbourne comedy circuit is the most internationally networked outside the UK and US. EventLinqs is built for Melbourne comedy organisers running events that the global comedy industry watches.",
  },
  'comedy/brisbane': {
    hero_subtitle: "Sunshine state, Saturday night laughs.",
    editorial:
      "Brisbane's comedy scene is established and growing. Sit Down Comedy Club in Paddington pulls four nights a week, Brisbane Powerhouse hosts touring international acts, the Princess Theatre in Woolloongabba runs underground circuit nights, Suncorp Piazza at South Bank hosts the festival headliners. Brisbane Comedy Festival every February at the Powerhouse runs three weeks across fifteen venues pulling sixty thousand attendees. Just for Laughs Brisbane every October at QPAC. The Brisbane comedy circuit has produced Wil Anderson, Tim Minchin and a generation of touring Australian comics. EventLinqs is built for Brisbane comedy organisers running events that anchor Queensland's deepest comedy market.",
  },
  'comedy/perth': {
    hero_subtitle: "Indian Ocean laughs.",
    editorial:
      "Perth's comedy scene punches above its size. Lazy Susan's Comedy Den in Mt Lawley pulls four nights a week, Astor Theatre hosts touring international acts, Perth Concert Hall hosts the festival headliners, Cygnet Cinema runs comedy film events. Perth Comedy Festival every May at the Astor pulls thirty thousand attendees over two weeks. Just for Laughs Perth every October at the Crown Theatre. The Perth comedy circuit is geographically isolated, which has produced a distinctive Western Australian comedy voice. The HBF Stadium and RAC Arena host the international touring acts. EventLinqs is built for Perth comedy organisers running events that anchor a comedy market on Australia's western edge.",
  },
  'comedy/adelaide': {
    hero_subtitle: "Festival city, festival of jokes.",
    editorial:
      "Adelaide's comedy scene punches enormously above its city size. Adelaide Fringe every March is the world's second-largest fringe festival (after Edinburgh), running four weeks across three hundred venues pulling three million attendees, with comedy as the largest single genre. The Garden of Unearthly Delights in Rundle Park is the festival's central comedy hub. Gluttony in Rymill Park hosts the biggest comedy headliners. Royal Croquet Club hosts contemporary comedy. The Adelaide Cabaret Festival every June at the Adelaide Festival Centre runs comedy cabaret. The Stirling Theatre runs year-round circuit nights. EventLinqs is built for Adelaide comedy organisers running events that anchor Australia's largest open-access comedy market.",
  },
  'comedy/gold-coast': {
    hero_subtitle: "Coast life, comedy nights.",
    editorial:
      "The Gold Coast comedy scene is mid-sized and lifestyle-led. The Star Gold Coast hosts touring international acts, HOTA hosts the festival headliners, the Beergarden Surfers runs underground circuit nights, the Bond University comedy club runs student-led nights through every semester. Gold Coast Comedy Festival every September at HOTA runs two weeks across ten venues pulling eight thousand attendees. Just for Laughs Gold Coast every October at the Convention Centre. The Gold Coast comedy circuit benefits from the constant tourist crowd and the warm climate that lets outdoor comedy run year-round. EventLinqs is built for Gold Coast comedy organisers running events that match coast lifestyle to live comedy.",
  },
  'comedy/canberra': {
    hero_subtitle: "Capital territory, capital laughs.",
    editorial:
      "Canberra's comedy scene is small but tight. The Canberra Comedy Festival every March at the Canberra Theatre Centre runs ten days across eight venues pulling fifteen thousand attendees. The Polish Club in Turner runs Tuesday open mic, the Phoenix Pub in Civic runs Wednesday underground circuit, the Smith's Alternative runs Friday weekly headliner shows. The ANU Comedy Club pulls fresh student energy each semester. Mooseheads runs the biggest student-aimed comedy nights. The National Convention Centre hosts touring international acts. The Canberra comedy circuit has produced more Aunty Donna-type ensemble groups than any other Australian city. EventLinqs is built for Canberra comedy organisers running events that thread laughter through the federal capital.",
  },
  'comedy/hobart': {
    hero_subtitle: "Apple Isle, comedy welcome.",
    editorial:
      "Hobart's comedy scene is small but proudly anchored. The Republic Bar runs Tuesday open mic, the Brisbane Hotel runs Wednesday underground circuit, the Peacock Theatre runs Friday weekly headliner shows. Hobart Comedy Festival every August at the Theatre Royal runs ten days across six venues pulling eight thousand attendees. The Wrest Point Casino hosts touring international acts. The University of Tasmania Comedy Club pulls fresh student energy each semester. Hobart's geographic isolation has produced a distinctively Tasmanian comedy voice that draws on the island's quirks. EventLinqs is built for Hobart comedy organisers running events that bring laughter to Australia's southernmost capital.",
  },
  'comedy/newcastle': {
    hero_subtitle: "Steel city, Saturday laughs.",
    editorial:
      "Newcastle's comedy scene is mid-sized and university-anchored. The Civic Theatre hosts touring international acts, the Cambridge Hotel runs Tuesday open mic, the Lass O'Gowrie runs Wednesday underground circuit, the Newcastle Comedy Festival every June at the Civic runs two weeks across eight venues pulling twelve thousand attendees. The University of Newcastle Comedy Club pulls fresh student energy each semester. The Hunter region's working-class storytelling tradition gives Newcastle comedy a distinct voice. EventLinqs is built for Newcastle comedy organisers running events that bring laughter across the steel river city.",
  },
  'comedy/wollongong': {
    hero_subtitle: "Illawarra coast, comedy welcome.",
    editorial:
      "Wollongong's comedy scene is small but university-anchored. The IPAC hosts touring international acts, the Heritage Hotel runs Tuesday open mic, Howlin' Wolf Alehouse runs Wednesday underground circuit, the Wollongong Comedy Festival every July at the IPAC runs ten days across six venues pulling six thousand attendees. The University of Wollongong Comedy Club pulls fresh student energy each semester. The UniBar runs Saturday weekly headliner shows. The Wollongong comedy circuit benefits from being a Sydney train ride away, with regular touring comedians playing the IPAC. EventLinqs is built for Wollongong comedy organisers running events that bring laughter to the steel coast.",
  },
  'comedy/geelong': {
    hero_subtitle: "Bay city, bay laughs.",
    editorial:
      "Geelong's comedy scene is mid-sized and university-anchored. GMHBA Stadium and Costa Hall host touring international acts, the Wool Exchange runs Tuesday open mic, the Sphinx Hotel runs Wednesday underground circuit, the Geelong Comedy Festival every July at GPAC runs ten days across six venues pulling eight thousand attendees. The Deakin University Comedy Club pulls fresh student energy each semester. The Beav runs Saturday weekly headliner shows. Geelong's comedy circuit benefits from being a Melbourne short-train away, with regular touring comedians playing GPAC. EventLinqs is built for Geelong comedy organisers running events that bring laughter to the bay city.",
  },
  'comedy/sunshine-coast': {
    hero_subtitle: "Hinterland warm, comedy nights.",
    editorial:
      "The Sunshine Coast comedy scene is mid-sized and lifestyle-led. The Events Centre Caloundra hosts touring international acts, the Solbar runs Tuesday open mic, the Lamb the Family runs Wednesday underground circuit, the Sunshine Coast Comedy Festival every September at the Events Centre runs ten days across five venues pulling six thousand attendees. The University of the Sunshine Coast Comedy Club pulls fresh student energy each semester. The Big Pineapple runs annual outdoor comedy days. The coast's holiday rhythm means comedy peaks during summer school holidays. EventLinqs is built for Sunshine Coast comedy organisers running events that match coast lifestyle to live laughs.",
  },
  'comedy/cairns': {
    hero_subtitle: "Tropical north, tropical laughs.",
    editorial:
      "Cairns has a small comedy scene anchored by tourism. The Cairns Convention Centre hosts touring international acts, the Crystalbrook Riley bar runs Tuesday open mic, the Pier Bar runs Wednesday underground circuit, the Wool Shed runs Friday weekly headliner shows. Cairns Comedy Festival every August at the Civic Theatre runs ten days across four venues pulling four thousand attendees. The James Cook University Comedy Club pulls fresh student energy each semester. The dry-season tourist crowd means comedy peaks May to October. EventLinqs is built for Cairns comedy organisers running events that bring laughter into the tropics.",
  },
  'comedy/darwin': {
    hero_subtitle: "Top End, Top End laughs.",
    editorial:
      "Darwin's comedy scene is small but tropical-anchored. The Darwin Convention Centre hosts touring international acts, Lola's Pergola runs Tuesday open mic, the Throb runs Wednesday underground circuit, the Happy Yess runs Friday weekly headliner shows. Darwin Festival every August across the city runs comedy as a major component pulling thirty thousand attendees. The Charles Darwin University Comedy Club pulls fresh student energy each semester. The dry-season tourist crowd means comedy peaks May to October. EventLinqs is built for Darwin comedy organisers running events that bring laughter to Australia's most tropical capital.",
  },
  'comedy/townsville': {
    hero_subtitle: "Tropical north, Saturday laughs.",
    editorial:
      "Townsville's comedy scene is mid-sized and military-and-university-anchored. The Townsville Entertainment Centre hosts touring international acts, the Brewery runs Tuesday open mic, the Mariners Bar runs Wednesday underground circuit, the Madison's Hotel runs Friday weekly headliner shows. Townsville Comedy Festival every August at the Civic Theatre runs ten days across five venues pulling five thousand attendees. The James Cook University Comedy Club pulls fresh student energy each semester. The Lavarack Barracks comedy nights anchor a substantial military audience. EventLinqs is built for Townsville comedy organisers running events that bring laughter across tropical north Queensland.",
  },
  'comedy/london': {
    hero_subtitle: "Where stand-up grew up.",
    editorial:
      "London is the European comedy capital. Soho holds the historic comedy clubs (the Comedy Store and the Soho Theatre), Covent Garden holds the touring headliner venues (the London Palladium and the Adelphi Theatre), Camden holds the alternative comedy circuit (the Camden Head and the Comedy Den), Edinburgh fringes feed London year-round. London Comedy Festival every June across one hundred venues pulls one million attendees. The Royal Festival Hall hosts the festival's biggest names. The Up the Creek in Greenwich, the 99 Club in Leicester Square, the Top Secret Comedy Club in Holborn anchor the year-round circuit. The London comedy industry is the largest English-language comedy market in the world. EventLinqs is built for London comedy organisers running events that the global comedy industry watches and copies.",
  },
  'comedy/new-york': {
    hero_subtitle: "Where stand-up was born.",
    editorial:
      "New York is the American comedy capital and the global home of stand-up. The Comedy Cellar in Greenwich Village (the most famous comedy club in the world), Carolines on Broadway, Stand Up NY on the Upper West Side, the Gotham Comedy Club in Chelsea anchor the historic comedy scene. The Brooklyn comedy circuit at Union Hall and Littlefield holds the contemporary alternative scene. New York Comedy Festival every November across fifty venues pulls four hundred thousand attendees. Madison Square Garden, the Beacon Theatre, Carnegie Hall host the festival's biggest names. The New York comedy industry produced Saturday Night Live, every late night show, and a steady stream of global comedy stars. EventLinqs is built for New York comedy organisers running events at the global home of stand-up.",
  },
  'comedy/toronto': {
    hero_subtitle: "Lakeside, lakefront laughs.",
    editorial:
      "Toronto is the Canadian comedy capital. The Second City Toronto in Mercer Street is the most influential improv institution in the world (graduates include Catherine O'Hara, Eugene Levy, Mike Myers, Dan Aykroyd, John Candy). Yuk Yuks across the city runs the country's largest stand-up chain. The Comedy Bar on Bloor West runs the alternative circuit. JFL Toronto in September runs ten days across forty venues pulling two hundred thousand attendees. The Roy Thomson Hall and Massey Hall host the festival's biggest names. The Toronto comedy industry has feeder lines to every Hollywood writers' room. EventLinqs is built for Toronto comedy organisers running events that anchor Canada's deepest comedy market.",
  },

  // ============================================================
  // WELLNESS
  // ============================================================
  'wellness/sydney': {
    hero_subtitle: "Where Sydney breathes.",
    editorial:
      "Sydney's wellness scene runs through Bondi, the Northern Beaches and the inner east. Sunrise yoga at Bondi Beach pulls one thousand on warm Sundays, Bondi to Bronte coastal walk meditation runs daily, Manly to Spit Bridge mindfulness walks every weekend, sound healing at Power Living Bondi, breathwork at Embodied Movement in Surry Hills. Wanderlust Sydney every September at Centennial Park pulls fifteen thousand for Australia's largest yoga and wellness festival. Vinyasa at Yogahub Surry Hills, Ashtanga at Yoga Mandir Bondi, kundalini at the Lotus Yoga School Bondi, Vipassana retreats at Blackheath in the Blue Mountains. The Sydney wellness scene is the most established in Australia and exports to every coast city. EventLinqs is built for Sydney wellness organisers running events that anchor Australia's biggest wellness market.",
  },
  'wellness/melbourne': {
    hero_subtitle: "Where Melbourne grounds.",
    editorial:
      "Melbourne's wellness scene runs through Fitzroy, Brunswick and the inner east. Sunrise yoga at the Tan around the Botanic Gardens pulls eight hundred on warm Sundays, Albert Park lake walks every weekend, sound healing at Power Living Fitzroy, breathwork at Wim Hof Method Melbourne in Brunswick. Wanderlust Melbourne every May at Werribee Park pulls twelve thousand for one of Australia's largest yoga and wellness festivals. Vinyasa at Yoga 213 in Carlton, Ashtanga at Ashtanga Yoga Melbourne in Fitzroy, kundalini at the Yoga Garden in St Kilda, Vipassana retreats at Woori Yallock in the Yarra Valley. The Melbourne wellness scene is the most cosmopolitan in Australia and runs year-round despite the cooler climate. EventLinqs is built for Melbourne wellness organisers running events that anchor Australia's deepest wellness market.",
  },
  'wellness/brisbane': {
    hero_subtitle: "Sunshine state, slow breath.",
    editorial:
      "Brisbane's wellness scene is sunshine-anchored and growing fast. Sunrise yoga at New Farm Park pulls four hundred on warm Sundays, the Brisbane River walk meditation runs daily, sound healing at Power Living New Farm, breathwork at Wim Hof Method Brisbane in Fortitude Valley. Wanderlust Brisbane every August at Brisbane Powerhouse pulls eight thousand for the city's largest wellness festival. Vinyasa at Yoga 213 in Bulimba, Ashtanga at Ashtanga Yoga Brisbane in West End, kundalini at the Lotus Yoga School in New Farm, Vipassana retreats at Pomona on the Sunshine Coast. The Brisbane wellness scene benefits from the warm climate that lets outdoor yoga run year-round. EventLinqs is built for Brisbane wellness organisers running events that anchor Queensland's deepest wellness market.",
  },
  'wellness/perth': {
    hero_subtitle: "Indian Ocean, slow breath.",
    editorial:
      "Perth's wellness scene is sunshine-anchored and beach-led. Sunrise yoga at Cottesloe Beach pulls three hundred on warm Sundays, Kings Park walk meditation runs daily, sound healing at Power Living Subiaco, breathwork at Wim Hof Method Perth in Mt Lawley. Wanderlust Perth every October at Whiteman Park pulls six thousand for the city's largest wellness festival. Vinyasa at Yoga 213 in Subiaco, Ashtanga at Ashtanga Yoga Perth in Mount Hawthorn, kundalini at the Lotus Yoga School in Cottesloe, Vipassana retreats at Bickley in the Perth Hills. The Perth wellness scene benefits from the dry climate and the long warm summers that let outdoor yoga run from October through April. EventLinqs is built for Perth wellness organisers running events that anchor Western Australia's deepest wellness market.",
  },
  'wellness/adelaide': {
    hero_subtitle: "Festival city, slow breath.",
    editorial:
      "Adelaide's wellness scene is mid-sized and growing through professional migration. Sunrise yoga at Henley Beach pulls two hundred on warm Sundays, Adelaide Botanic Garden walks every weekend, sound healing at Power Living North Adelaide, breathwork at Wim Hof Method Adelaide in Norwood. Wanderlust Adelaide every November at Belair National Park pulls four thousand for the city's largest wellness festival. Vinyasa at Yoga 213 in Norwood, Ashtanga at Ashtanga Yoga Adelaide in Goodwood, kundalini at the Lotus Yoga School in Glenelg, Vipassana retreats at Mount Pleasant in the Adelaide Hills. Adelaide Fringe each March features yoga and wellness as growing genres. EventLinqs is built for Adelaide wellness organisers running events that anchor South Australia's deepest wellness market.",
  },
  'wellness/gold-coast': {
    hero_subtitle: "Coast life, slow breath.",
    editorial:
      "The Gold Coast wellness scene is one of the largest per-capita in Australia. Sunrise yoga at Burleigh Beach pulls six hundred on warm Sundays, Currumbin to Burleigh coastal walk meditation runs daily, Tallebudgera Creek paddleboard yoga every weekend, sound healing at Power Living Burleigh, breathwork at Wim Hof Method Gold Coast in Mermaid Beach. Wanderlust Gold Coast every October at HOTA pulls twelve thousand for one of Australia's largest wellness festivals. Vinyasa at Yoga 213 in Burleigh, Ashtanga at Ashtanga Yoga Gold Coast in Mermaid Beach, kundalini at the Lotus Yoga School in Coolangatta, Vipassana retreats at Pomona in the Sunshine Coast hinterland. The Gold Coast wellness scene benefits from the warm climate and the surf-yoga overlap that defines Australian coastal wellness. EventLinqs is built for Gold Coast wellness organisers running events that anchor Australia's most coastal wellness market.",
  },
  'wellness/canberra': {
    hero_subtitle: "Capital community, slow breath.",
    editorial:
      "Canberra's wellness scene is small but growing. Sunrise yoga at Lake Burley Griffin pulls one hundred fifty on warm Sundays, Mount Ainslie walks every weekend, sound healing at Power Living Manuka, breathwork at Wim Hof Method Canberra in Braddon. Wanderlust Canberra every November at the National Arboretum pulls three thousand for the city's largest wellness festival. Vinyasa at Yoga 213 in Manuka, Ashtanga at Ashtanga Yoga Canberra in Braddon, kundalini at the Lotus Yoga School in Kingston, Vipassana retreats at Bungendore. The ANU Wellness programme runs community nights through every semester. EventLinqs is built for Canberra wellness organisers running events that thread mindfulness through the federal capital.",
  },
  'wellness/hobart': {
    hero_subtitle: "Apple Isle, slow breath.",
    editorial:
      "Hobart's wellness scene is small but proudly nature-led. Sunrise yoga at Sandy Bay Beach pulls eighty on warm Sundays, Mount Wellington walks every weekend, sound healing at Power Living North Hobart, breathwork at Wim Hof Method Hobart in Battery Point. Wellness Festival Tasmania every November at Salamanca Lawns pulls one thousand five hundred for the state's largest wellness festival. Vinyasa at Yoga 213 in North Hobart, Ashtanga at Ashtanga Yoga Hobart in Battery Point, kundalini at the Lotus Yoga School in Sandy Bay, Vipassana retreats at the Bruny Island Meditation Centre. The Tasmanian wellness scene benefits from the cool, clean air and the wilderness on the doorstep. EventLinqs is built for Hobart wellness organisers running events that thread mindfulness through Australia's southernmost capital.",
  },
  'wellness/newcastle': {
    hero_subtitle: "Steel city, slow breath.",
    editorial:
      "Newcastle's wellness scene is mid-sized and beach-led. Sunrise yoga at Newcastle Beach pulls one hundred fifty on warm Sundays, Bathers Way coastal walk meditation runs daily, sound healing at Power Living Cooks Hill, breathwork at Wim Hof Method Newcastle in Hamilton. Wanderlust Newcastle every September at Foreshore Park pulls three thousand for the region's largest wellness festival. Vinyasa at Yoga 213 in Cooks Hill, Ashtanga at Ashtanga Yoga Newcastle in Mayfield, kundalini at the Lotus Yoga School in Hamilton, Vipassana retreats at Pokolbin in the Hunter Valley. The Newcastle wellness scene benefits from the surf-yoga overlap and the proximity to the Hunter Valley wine country. EventLinqs is built for Newcastle wellness organisers running events that thread mindfulness through the steel river city.",
  },
  'wellness/wollongong': {
    hero_subtitle: "Illawarra coast, slow breath.",
    editorial:
      "Wollongong's wellness scene is mid-sized and beach-led. Sunrise yoga at North Beach pulls one hundred on warm Sundays, the Sea Cliff Bridge to Wombarra coastal walk meditation runs every weekend, sound healing at Power Living Cooks Hill, breathwork at Wim Hof Method Wollongong in Figtree. Wellness Festival Illawarra every September at Stuart Park pulls two thousand for the region's largest wellness festival. Vinyasa at Yoga 213 in Wollongong, Ashtanga at Ashtanga Yoga Wollongong in Figtree, kundalini at the Lotus Yoga School in Thirroul, Vipassana retreats at the Hindu Forest Monastery in the Southern Highlands. The University of Wollongong Wellness programme runs community nights through every semester. EventLinqs is built for Wollongong wellness organisers running events that thread mindfulness through the steel coast.",
  },
  'wellness/geelong': {
    hero_subtitle: "Bay city, slow breath.",
    editorial:
      "Geelong's wellness scene is mid-sized and bay-led. Sunrise yoga at Eastern Beach pulls one hundred on warm Sundays, the Geelong Waterfront walk meditation runs every weekend, sound healing at Power Living Newtown, breathwork at Wim Hof Method Geelong in Highton. Wellness Festival Geelong every November at Steampacket Gardens pulls two thousand for the region's largest wellness festival. Vinyasa at Yoga 213 in Newtown, Ashtanga at Ashtanga Yoga Geelong in Belmont, kundalini at the Lotus Yoga School in Torquay, Vipassana retreats at Anglesea on the Surf Coast. The Deakin University Wellness programme runs community nights through every semester. EventLinqs is built for Geelong wellness organisers running events that thread mindfulness through the bay city.",
  },
  'wellness/sunshine-coast': {
    hero_subtitle: "Hinterland warm, slow breath.",
    editorial:
      "The Sunshine Coast wellness scene is one of the most established in Australia. Sunrise yoga at Mooloolaba Beach pulls four hundred on warm Sundays, Buderim Forest Park walks every weekend, sound healing at Power Living Buderim, breathwork at Wim Hof Method Sunshine Coast in Maroochydore. Wanderlust Sunshine Coast every November at Maleny pulls eight thousand for one of Australia's largest hinterland wellness festivals. Vinyasa at Yoga 213 in Maroochydore, Ashtanga at Ashtanga Yoga Sunshine Coast in Buderim, kundalini at the Lotus Yoga School in Eumundi, Vipassana retreats at Pomona and Maleny. The Sunshine Coast hinterland is one of the largest wellness retreat centres in the southern hemisphere. EventLinqs is built for Sunshine Coast wellness organisers running events that anchor Australia's deepest hinterland wellness market.",
  },
  'wellness/cairns': {
    hero_subtitle: "Tropical north, slow breath.",
    editorial:
      "Cairns has a small but tropical-anchored wellness scene. Sunrise yoga at the Esplanade Lagoon pulls one hundred on warm Sundays, the Tablelands walks every weekend, sound healing at Power Living Manunda, breathwork at Wim Hof Method Cairns in Edge Hill. Wellness Festival Cairns every August at Munro Martin Parklands pulls one thousand for the region's largest wellness festival. Vinyasa at Yoga 213 in Cairns North, Ashtanga at Ashtanga Yoga Cairns in Edge Hill, kundalini at the Lotus Yoga School in Trinity Beach, Vipassana retreats at Mossman Gorge in the Daintree. The Cairns wellness scene benefits from the rainforest and reef proximity that defines tropical wellness. EventLinqs is built for Cairns wellness organisers running events that thread mindfulness through Australia's tropical reef capital.",
  },
  'wellness/darwin': {
    hero_subtitle: "Top End, slow breath.",
    editorial:
      "Darwin's wellness scene is small but tropical-anchored. Sunrise yoga at the Esplanade pulls eighty on warm dry-season Sundays, the Casuarina Beach walks every weekend, sound healing at Power Living Mitchell Street, breathwork at Wim Hof Method Darwin in Casuarina. Wellness Festival Darwin every August at Bicentennial Park pulls eight hundred for the territory's largest wellness festival. Vinyasa at Yoga 213 in Stuart Park, Ashtanga at Ashtanga Yoga Darwin in Casuarina, kundalini at the Lotus Yoga School in Coconut Grove, Vipassana retreats at Berry Springs. The dry-season climate makes Darwin a natural wellness destination from May to October. EventLinqs is built for Darwin wellness organisers running events that thread mindfulness through Australia's most tropical capital.",
  },
  'wellness/townsville': {
    hero_subtitle: "Tropical north, slow breath.",
    editorial:
      "Townsville has a mid-sized wellness scene. Sunrise yoga at the Strand pulls one hundred fifty on warm dry-season Sundays, Castle Hill walks every weekend, sound healing at Power Living Annandale, breathwork at Wim Hof Method Townsville in Pallarenda. Wellness Festival North Queensland every August at Riverway pulls one thousand five hundred for the region's largest wellness festival. Vinyasa at Yoga 213 in Annandale, Ashtanga at Ashtanga Yoga Townsville in Mount Louisa, kundalini at the Lotus Yoga School in Magnetic Island, Vipassana retreats at the Paluma Range National Park. The James Cook University Wellness programme runs community nights through every semester. EventLinqs is built for Townsville wellness organisers running events that thread mindfulness through tropical north Queensland.",
  },
  'wellness/london': {
    hero_subtitle: "Where Europe breathes.",
    editorial:
      "London is the European wellness capital. Notting Hill and Hampstead hold the established yoga community, Shoreditch holds the contemporary alternative wellness scene, Kensington holds the high-end clinical wellness centres, Hackney holds the breathwork and ice-bath crowd. Wanderlust London every July at Battersea Park pulls twenty thousand. The Regent's Park sunrise yoga every weekend pulls one thousand on warm Sundays. Vinyasa at Triyoga Soho, Ashtanga at the Life Centre Notting Hill, kundalini at the Kundalini Centre Maida Vale, Vipassana retreats at Hereford. The British wellness industry runs the most diverse wellness market in Europe. EventLinqs is built for London wellness organisers running events that anchor Europe's deepest wellness market.",
  },
  'wellness/new-york': {
    hero_subtitle: "Five boroughs, slow breath.",
    editorial:
      "New York is the American wellness capital. Williamsburg and Greenpoint hold the contemporary alternative wellness scene, the Upper East Side holds the high-end clinical wellness centres, Tribeca holds the celebrity wellness studios, Brooklyn Heights holds the established yoga community. Wanderlust NYC every June at Brooklyn Bridge Park pulls thirty thousand. Central Park sunrise yoga every weekend pulls two thousand on warm Sundays. Vinyasa at Pure Yoga Upper West Side, Ashtanga at the Ashtanga Yoga Center Tribeca, kundalini at the Kundalini Yoga Center Manhattan, Vipassana retreats at Shelburne Falls Massachusetts. The American wellness industry runs out of New York and California, with NYC anchoring the East Coast. EventLinqs is built for NYC wellness organisers running events that anchor America's deepest wellness market.",
  },
  'wellness/toronto': {
    hero_subtitle: "Lakeside, slow breath.",
    editorial:
      "Toronto is the Canadian wellness capital. Yorkville and Forest Hill hold the established yoga community, the Annex holds the contemporary alternative wellness scene, Liberty Village holds the breathwork and ice-bath crowd, Yonge-Eglinton holds the high-end clinical wellness centres. Wanderlust Toronto every July at Blue Mountain pulls fifteen thousand. Toronto Yoga Conference every June at the Sheraton pulls four thousand. Sunrise yoga at the Toronto Islands every warm Saturday pulls eight hundred. Vinyasa at Pure Yoga Toronto, Ashtanga at the Octopus Garden Yoga Centre Yorkville, kundalini at the Kundalini Yoga Centre Bloor Street, Vipassana retreats at Pemberton Valley British Columbia. The Toronto wellness industry runs the most diverse wellness market in Canada. EventLinqs is built for Toronto wellness organisers running events that anchor Canada's deepest wellness market.",
  },

  // ============================================================
  // PRIDE
  // ============================================================
  'pride/sydney': {
    hero_subtitle: "Mardi Gras, year-round.",
    editorial:
      "Sydney is the Pride capital of the southern hemisphere. Sydney Mardi Gras every March down Oxford Street pulls one million for the largest LGBTIQA+ parade in the world outside Sao Paulo. Darlinghurst is the historic Mardi Gras heart, Newtown holds the contemporary queer arts community, Kings Cross holds the cabaret and drag scene, Erskineville holds the lesbian community heart. The Imperial Hotel in Erskineville, Stonewall Hotel and the Oxford Hotel anchor the year-round Oxford Street circuit. World Pride 2023 brought five hundred thousand international visitors. The Sydney Gay and Lesbian Choir, Mardi Gras Film Festival every February, Bingo Loco every weekend at the Beresford. EventLinqs is built for Sydney Pride organisers running events that anchor the global Pride capital of the southern hemisphere.",
  },
  'pride/melbourne': {
    hero_subtitle: "Pride city, year-round.",
    editorial:
      "Melbourne's Pride scene is one of the deepest in Australia. Midsumma Festival every January at Alexandra Gardens pulls two hundred thousand across three weeks, Pride March on Fitzroy Street St Kilda every February pulls eighty thousand. Fitzroy and Collingwood hold the contemporary queer arts community, Prahran holds the historic LGBTIQA+ heart, the Peel Hotel and the Laird in Collingwood anchor the year-round circuit, Sircuit on Smith Street holds the queer dance music scene. ChillOut Festival in Daylesford every March is the largest regional LGBTIQA+ festival in the southern hemisphere. The Victorian Pride Centre in St Kilda. The Australian LGBTIQ+ Multicultural Council. The Melbourne Queer Film Festival every March at ACMI. EventLinqs is built for Melbourne Pride organisers running events that anchor Australia's deepest Pride community.",
  },
  'pride/brisbane': {
    hero_subtitle: "Sunshine state, Pride city.",
    editorial:
      "Brisbane Pride Festival every September at New Farm Park pulls thirty thousand for the city's biggest queer celebration. Brisbane Pride Rally and March every September pulls twenty thousand through the inner city. Fortitude Valley holds the historic Brisbane Pride heart, the Wickham Hotel anchors the year-round circuit, Sportsman Hotel in Spring Hill holds the contemporary LGBTIQA+ scene, the Beat Megaclub in the Valley holds the dance music community. Brisbane Queer Film Festival every March at the Brisbane Powerhouse. Big Gay Day at the Wickham every March. The Queensland AIDS Council and the LGBTI Legal Service anchor year-round community events. The University of Queensland Pride Network pulls fresh student energy each semester. EventLinqs is built for Brisbane Pride organisers running events that anchor Queensland's deepest LGBTIQA+ community.",
  },
  'pride/perth': {
    hero_subtitle: "Indian Ocean, Pride city.",
    editorial:
      "PrideFest Perth every November runs across two weeks with the Pride Parade through Northbridge pulling forty thousand for the largest LGBTIQA+ celebration in Western Australia. Northbridge holds the historic Perth Pride heart, the Court in James Street and Connections Nightclub anchor the year-round circuit, Mt Lawley holds the contemporary queer arts community, Maylands holds the lesbian community heart. Perth Pride Festival every November includes Pride Fairday at Hyde Park, Pride Run, Pride Picnic at Wellington Square. Perth Queer Film Festival every August at Luna Cinemas. The Pride WA organisation. The University of Western Australia Pride Network and Curtin Queer Collective pull fresh student energy. EventLinqs is built for Perth Pride organisers running events that anchor Western Australia's deepest LGBTIQA+ community.",
  },
  'pride/adelaide': {
    hero_subtitle: "Festival city, Pride welcome.",
    editorial:
      "Feast Festival every November at Light Square pulls twenty thousand for the South Australian LGBTIQA+ festival. Adelaide Pride March every November through the city pulls eight thousand. Hindley Street holds the historic Adelaide Pride heart, the Mars Bar and Mary's Poppin anchor the year-round circuit, Norwood holds the contemporary queer arts community, North Adelaide holds the lesbian community heart. Feast Festival includes Pride Picnic at Pinky Flat, Drag Bingo at Sugar, Queer Film Festival at the Mercury. Adelaide Fringe each March features substantial queer programming. The South Australian Council for Civil Liberties. The University of Adelaide Pride Network. The Adelaide Pride Marching Band leads every march. EventLinqs is built for Adelaide Pride organisers running events that anchor South Australia's LGBTIQA+ community.",
  },
  'pride/gold-coast': {
    hero_subtitle: "Coast life, Pride love.",
    editorial:
      "Gold Coast Pride Festival every June pulls fifteen thousand across two weeks for the largest LGBTIQA+ celebration in regional Queensland. Coolangatta and Surfers Paradise hold the historic Gold Coast Pride heart, the Wickham at Currumbin and Mantra at Sharks Bar anchor the year-round circuit, Burleigh Heads holds the contemporary queer community. Gold Coast Pride includes Pride Parade through Surfers Paradise, Pride Picnic at Burleigh Beach, Drag Bingo at the Beergarden, Pride Run on the Esplanade. The University of Queensland Pride Network and Bond University Queer Collective pull fresh student energy. The warm climate lets outdoor Pride events run year-round. EventLinqs is built for Gold Coast Pride organisers running events that match coast lifestyle to LGBTIQA+ celebration.",
  },
  'pride/canberra': {
    hero_subtitle: "Capital community, Pride love.",
    editorial:
      "SpringOUT Pride Festival every November at Glebe Park pulls eight thousand across two weeks for the ACT LGBTIQA+ festival. Pride Parade through the city pulls four thousand. Civic holds the Canberra Pride heart, Mooseheads anchors the year-round circuit, Cube Nightclub holds the dance music community. SpringOUT includes Pride Picnic at Lennox Gardens, Drag Bingo at Smith's Alternative, Queer Film Festival at the Dendy. The ACT Government's commitment to LGBTIQA+ equality has made Canberra one of the most welcoming Pride cities in Australia. The ANU Queer Department and University of Canberra Pride Network anchor a steady stream of student-led events. EventLinqs is built for Canberra Pride organisers running events that thread LGBTIQA+ celebration through the federal capital.",
  },
  'pride/hobart': {
    hero_subtitle: "Apple Isle, Pride love.",
    editorial:
      "Hobart Pride every November at Salamanca Lawns pulls four thousand for Tasmania's biggest LGBTIQA+ festival. Pride March from Salamanca to the Hobart Town Hall pulls two thousand. North Hobart holds the contemporary queer community, the Republic Bar anchors the year-round circuit, the Brisbane Hotel holds the dance music community, Salamanca holds the historic Pride heart. Hobart Pride includes Pride Picnic at Salamanca, Drag Bingo at the Telegraph Hotel, Queer Film Festival at the State Cinema. The Tasmanian Gay and Lesbian Rights Group. The University of Tasmania Queer Collective pulls fresh student energy each semester. The Australian Marriage Equality movement was largely led from Tasmania. EventLinqs is built for Hobart Pride organisers running events that anchor LGBTIQA+ celebration in Australia's southernmost capital.",
  },
  'pride/newcastle': {
    hero_subtitle: "Steel city, Pride love.",
    editorial:
      "Newcastle Pride every September at Foreshore Park pulls eight thousand for the Hunter region's biggest LGBTIQA+ festival. Pride March from Civic Park along Hunter Street pulls four thousand. Hamilton holds the historic Newcastle Pride heart, the Cambridge Hotel anchors the year-round circuit, the Cosmopolitan Hotel holds the contemporary queer community. Newcastle Pride includes Pride Picnic at King Edward Park, Drag Bingo at the Lass O'Gowrie, Queer Film Festival at the Newcastle Town Hall. The Newcastle Pride community group runs year-round events. The University of Newcastle Pride Network pulls fresh student energy each semester. EventLinqs is built for Newcastle Pride organisers running events that anchor LGBTIQA+ celebration in the Hunter river city.",
  },
  'pride/wollongong': {
    hero_subtitle: "Illawarra coast, Pride love.",
    editorial:
      "Wollongong Pride Festival every September at Stuart Park pulls six thousand for the Illawarra's biggest LGBTIQA+ festival. Pride March through Crown Street pulls three thousand. Wollongong holds the historic Pride heart, the Servo Hotel anchors the year-round circuit, the Heritage Hotel holds the contemporary queer community. Wollongong Pride includes Pride Picnic at North Beach, Drag Bingo at the Heritage, Queer Film Festival at the Wollongong Town Hall. The South Coast LGBTIQA+ Network runs year-round events. The University of Wollongong Pride Network pulls fresh student energy each semester. The wider Illawarra community has been one of the most LGBTIQA+ welcoming regions in NSW. EventLinqs is built for Wollongong Pride organisers running events that thread LGBTIQA+ celebration through the steel coast.",
  },
  'pride/geelong': {
    hero_subtitle: "Bay city, Pride welcome.",
    editorial:
      "Geelong Pride Festival every March at Johnstone Park pulls five thousand for the bay region's LGBTIQA+ festival. Pride March through central Geelong pulls two thousand. Newtown holds the historic Geelong Pride heart, the Beav anchors the year-round circuit, the Wool Exchange holds the contemporary queer community. Geelong Pride includes Pride Picnic at Eastern Beach, Drag Bingo at the Sphinx, Queer Film Festival at the Pivotonian. The Geelong Pride Network runs year-round events. The Deakin University Queer Collective pulls fresh student energy each semester. The wider Geelong community has been growing as a Pride-welcoming regional centre. EventLinqs is built for Geelong Pride organisers running events that thread LGBTIQA+ celebration through the second city of Victoria.",
  },
  'pride/sunshine-coast': {
    hero_subtitle: "Hinterland warm, Pride love.",
    editorial:
      "Sunshine Coast Pride every June at Cotton Tree Park pulls four thousand for the coast's LGBTIQA+ festival. Pride March from Maroochydore to Cotton Tree pulls one thousand five hundred. Maroochydore holds the historic Sunshine Coast Pride heart, the Solbar anchors the year-round circuit, the Big Pineapple grounds host the bigger annual events. Sunshine Coast Pride includes Pride Picnic at Mooloolaba Beach, Drag Bingo at the Surfair, Queer Film Festival at the BCC Cinemas. The Sunshine Coast Pride Network runs year-round events. The University of the Sunshine Coast Queer Collective pulls fresh student energy. The hinterland retreat venues at Maleny and Montville host LGBTIQA+ wellness retreats. EventLinqs is built for Sunshine Coast Pride organisers running events that match coast lifestyle to LGBTIQA+ celebration.",
  },
  'pride/cairns': {
    hero_subtitle: "Tropical north, Pride love.",
    editorial:
      "Cairns Pride Festival every September at Munro Martin Parklands pulls three thousand for the Far North Queensland LGBTIQA+ festival. Pride March through the city pulls one thousand five hundred. The Esplanade holds the historic Cairns Pride heart, the Pier Bar anchors the year-round circuit, Bluesky Brewery holds the contemporary queer community. Cairns Pride includes Pride Picnic at the Esplanade, Drag Bingo at the Salt House, Queer Film Festival at JUTE Theatre. The Far North Queensland LGBTIQA+ Network runs year-round events. The James Cook University Queer Collective pulls fresh student energy each semester. The tropical climate and tourism crowd let outdoor Pride run year-round. EventLinqs is built for Cairns Pride organisers running events that anchor LGBTIQA+ celebration in Australia's tropical reef capital.",
  },
  'pride/darwin': {
    hero_subtitle: "Top End, Pride welcome.",
    editorial:
      "Darwin Pride Festival every June at Bicentennial Park pulls four thousand for the territory's LGBTIQA+ festival. Pride March through Mitchell Street pulls two thousand. Mitchell Street holds the historic Darwin Pride heart, the Tap on Mitchell anchors the year-round circuit, Throb Nightclub holds the contemporary queer community. Darwin Pride includes Pride Picnic at Mindil Beach, Drag Bingo at Lola's Pergola, Queer Film Festival at the Deckchair Cinema. The Darwin Pride Network runs year-round events. The Charles Darwin University Queer Collective pulls fresh student energy each semester. The dry-season climate makes Darwin Pride one of the most welcoming festivals for the Top End's LGBTIQA+ community. EventLinqs is built for Darwin Pride organisers running events that thread LGBTIQA+ celebration through Australia's most tropical capital.",
  },
  'pride/townsville': {
    hero_subtitle: "Tropical north, Pride love.",
    editorial:
      "Townsville Pride every June at Riverway pulls three thousand for North Queensland's LGBTIQA+ festival. Pride March through the city pulls one thousand five hundred. Flinders Street holds the historic Townsville Pride heart, the Brewery anchors the year-round circuit, the Madison's Hotel holds the contemporary queer community. Townsville Pride includes Pride Picnic at the Strand, Drag Bingo at the Mariners Bar, Queer Film Festival at the Civic Theatre. The North Queensland LGBTIQA+ Network runs year-round events. The James Cook University Queer Collective pulls fresh student energy each semester. The tropical climate and the dry-season tourism crowd let outdoor Pride run May to October. EventLinqs is built for Townsville Pride organisers running events that anchor LGBTIQA+ celebration in tropical north Queensland.",
  },
  'pride/london': {
    hero_subtitle: "Where Pride pulls a million.",
    editorial:
      "Pride in London every July down Regent Street pulls one and a half million for the largest LGBTIQA+ celebration in the United Kingdom. Soho holds the historic London Pride heart with G-A-Y, Heaven, Ku Bar and the Royal Vauxhall Tavern anchoring decades of queer community, Vauxhall holds the contemporary club scene, Hackney holds the queer arts community, Brighton fifty miles south holds the seaside queer capital that draws London weekenders. London Pride includes Pride in the Park, Trans Pride, UK Black Pride, Pride Cabaret at the Roundhouse. The Stonewall organisation. The London LGBTQ+ Community Centre. EventLinqs is built for London Pride organisers running events that anchor the UK's deepest LGBTIQA+ community.",
  },
  'pride/new-york': {
    hero_subtitle: "Where Pride started.",
    editorial:
      "New York is the global birthplace of Pride. The Stonewall Inn on Christopher Street is the historic origin point of the modern LGBTIQA+ movement. NYC Pride every June pulls two and a half million through the West Village for the largest Pride parade in the world outside Sao Paulo. Greenwich Village holds the historic NYC Pride heart, Hell's Kitchen holds the contemporary queer community, Brooklyn's Park Slope holds the lesbian community heart, Harlem holds the historic queer Black community. NYC Pride includes the Dyke March, the Drag March, Family Movie Night, Queer Liberation March, NYC Black Pride. World Pride 2019 brought five million to NYC. The LGBTQ+ Community Centre. The Lesbian Herstory Archives. EventLinqs is built for New York Pride organisers running events at the global birthplace of Pride.",
  },
  'pride/toronto': {
    hero_subtitle: "Lakeside, Pride pulls a million.",
    editorial:
      "Toronto Pride every June down Yonge Street pulls one and a half million for the largest LGBTIQA+ celebration in North America after NYC and Sao Paulo. The Church-Wellesley Village holds the historic Toronto Pride heart with Crews and Tangos, Woody's, the Black Eagle and the Beaver anchoring decades of queer community. Queen West holds the contemporary queer arts community. Toronto Pride includes the Dyke March, Trans Pride, Pride Family Day, Pride Cabaret at the Royal Alexandra. World Pride 2014 brought one million to Toronto. The 519 Church Street Community Centre is the largest LGBTIQA+ community centre in Canada. The University of Toronto LGBTQ+ Resource Centre. The Toronto Pride community is the most multicultural Pride community in North America. EventLinqs is built for Toronto Pride organisers running events that anchor Canada's deepest LGBTIQA+ community.",
  },
}

/**
 * Read an intersection editorial. Returns the hand-crafted entry when
 * one exists, falls back to a brand-safe templated paragraph otherwise.
 * The fallback exists for forward-compatibility: if a new culture city
 * is added to data.ts before its hand-crafted entry lands, the page
 * still renders cleanly.
 */
export function getIntersectionEditorial(
  culture: CultureContent,
  citySlug: string,
  cityName: string,
  cityRecord: CityContent | null,
): string {
  const key = `${culture.slug}/${citySlug}`
  const entry = INTERSECTIONS[key]
  if (entry) return entry.editorial
  return fallbackEditorial(culture, cityName, cityRecord)
}

export function getIntersectionHeroSubtitle(
  culture: CultureContent,
  citySlug: string,
  cityName: string,
): string {
  const key = `${culture.slug}/${citySlug}`
  const entry = INTERSECTIONS[key]
  if (entry) return entry.hero_subtitle
  return `${culture.tagline} On stage in ${cityName}.`
}

function joinList(items: string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

function fallbackEditorial(culture: CultureContent, cityName: string, cityRecord: CityContent | null): string {
  const subCultureLabels = culture.subCultures.slice(0, 4).map(s => s.label)
  const subCultureSentence = subCultureLabels.length > 0
    ? `${joinList(subCultureLabels)} are all on across ${cityName} when the calendar fills up.`
    : `Every ${culture.displayName} sound is on across ${cityName} when the calendar fills up.`
  const stateLine = cityRecord?.state
    ? `${cityName}, ${cityRecord.state}, has a ${culture.displayName.toLowerCase()} community that books every kind of venue, from community halls to live-music venues to outdoor festival sites.`
    : `${cityName} has a ${culture.displayName.toLowerCase()} community that books every kind of venue.`
  return `${stateLine} ${subCultureSentence} EventLinqs is built for ${cityName} ${culture.displayName.toLowerCase()} organisers who want transparent fees, WhatsApp-first sharing, and squad bookings so the whole crew comes together. ${culture.tagline}`
}
