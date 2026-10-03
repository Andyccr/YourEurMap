"""Approximate historical ownership for Europa Canvas.

Boundaries are modern administrative units. Each tuple is the controlling
polity in 1492, 1650, 1815, 1914, 1938, and the modern atlas. These are
playable simplifications, not an authoritative reconstruction.
"""

from __future__ import annotations

import unicodedata

YEARS = ("1492", "1650", "1815", "1914", "1938", "modern")

# id -> (display name, fill color)
COUNTRIES = {
    "fra": ("France", "#2f6fad"),
    "eng": ("England", "#b4232c"),
    "sco": ("Scotland", "#2c3d78"),
    "gbr": ("United Kingdom", "#9d2430"),
    "ire": ("Ireland", "#1f8a4c"),
    "cas": ("Castile", "#d4a017"),
    "ara": ("Crown of Aragon", "#c14b3a"),
    "spa": ("Spain", "#e0a100"),
    "por": ("Portugal", "#1d7a42"),
    "nav": ("Navarre", "#c4622d"),
    "hab": ("Habsburg Lands", "#8d3d52"),
    "aus": ("Austrian Empire", "#c45b6a"),
    "auh": ("Austria-Hungary", "#d36b78"),
    "aut": ("Austria", "#a33d4e"),
    "den": ("Denmark", "#c0392b"),
    "swe": ("Sweden", "#3d7ea6"),
    "nor": ("Norway", "#8e3b4a"),
    "fin": ("Finland", "#6f97c4"),
    "isl": ("Iceland", "#4f6f8f"),
    "pol": ("Poland", "#c45b7a"),
    "lit": ("Lithuania", "#6d4c7d"),
    "plc": ("Polish-Lithuanian Commonwealth", "#a84b68"),
    "mos": ("Muscovy", "#3f6b45"),
    "rus": ("Russia", "#3e7a4f"),
    "sov": ("Soviet Union", "#8a3e3e"),
    "kaz": ("Khanate of Kazan", "#6a8f3a"),
    "ast": ("Astrakhan", "#c47b2b"),
    "psk": ("Pskov", "#5c6b8a"),
    "rya": ("Ryazan", "#7a5a3a"),
    "cri": ("Crimean Khanate", "#b5832f"),
    "cau": ("North Caucasus", "#6e5a4a"),
    "ott": ("Ottoman Empire", "#c47b2a"),
    "tur": ("Turkey", "#d08a4c"),
    "hun": ("Hungary", "#5f8f4e"),
    "boh": ("Bohemia", "#c4564a"),
    "bav": ("Bavaria", "#4e7cae"),
    "bra": ("Brandenburg", "#6a7f9a"),
    "pru": ("Prussia", "#3e4f63"),
    "sax": ("Saxony", "#6faf6a"),
    "pal": ("Electoral Palatinate", "#c9a15b"),
    "swi": ("Swiss Confederacy", "#b4373a"),
    "mil": ("Milan", "#5b8f7a"),
    "ven": ("Venice", "#7a1f2b"),
    "tus": ("Tuscany", "#c46a4a"),
    "pap": ("Papal States", "#b7a48a"),
    "nap": ("Naples", "#4f7f6b"),
    "gen": ("Genoa", "#c9b15a"),
    "sav": ("Savoy", "#8a3d4a"),
    "sar": ("Sardinia-Piedmont", "#a85a4a"),
    "sic": ("Two Sicilies", "#3f6f62"),
    "mod": ("Modena", "#5a7a4a"),
    "par": ("Parma", "#c4a05a"),
    "man": ("Mantua", "#7a6a3a"),
    "luc": ("Lucca", "#6a8a4a"),
    "sie": ("Siena", "#a85a3a"),
    "est": ("Ferrara", "#8a6a3a"),
    "teu": ("Teutonic Order", "#8e97a3"),
    "pom": ("Pomerania", "#4a7a8a"),
    "liv": ("Livonian Order", "#6a5a4a"),
    "cou": ("Courland", "#4a6a5a"),
    "wal": ("Wallachia", "#6a8a3a"),
    "mol": ("Moldavia", "#c4a04a"),
    "tra": ("Transylvania", "#5a6a8a"),
    "per": ("Persia", "#6a8f4a"),
    "rag": ("Ragusa", "#8a3a3a"),
    "kni": ("Knights of Malta", "#8a2a2a"),
    "and": ("Andorra", "#c9a24a"),
    "mco": ("Monaco", "#a33a3a"),
    "sma": ("San Marino", "#6a8ab0"),
    "vat": ("Vatican City", "#c4b07a"),
    "bre": ("Bremen", "#8a3a3a"),
    "ham": ("Hamburg", "#3a5a8a"),
    "hes": ("Hesse", "#6a8a6a"),
    "mec": ("Mecklenburg", "#5a7a6a"),
    "wur": ("Württemberg", "#c47a3a"),
    "han": ("Hanover", "#c4b43a"),
    "thu": ("Thuringian States", "#5a8a6a"),
    "bel": ("Belgium", "#c9a227"),
    "ned": ("Netherlands", "#e07a2f"),
    "nld": ("United Netherlands", "#d36a28"),
    "lux": ("Luxembourg", "#6aa0c4"),
    "lie": ("Liechtenstein", "#3a5a8a"),
    "ger": ("Germany", "#5c6b73"),
    "ita": ("Italy", "#4f8a5b"),
    "rom": ("Romania", "#d4b43a"),
    "bul": ("Bulgaria", "#4f8f6a"),
    "gre": ("Greece", "#3f6fbf"),
    "alb": ("Albania", "#8a2a2a"),
    "srp": ("Serbia", "#8a3a4a"),
    "mnt": ("Montenegro", "#6a3038"),
    "yug": ("Yugoslavia", "#4a6a9a"),
    "cze": ("Czechoslovakia", "#c45b5b"),
    "svk": ("Slovakia", "#6a8ec4"),
    "ukr": ("Ukraine", "#d4a017"),
    "blr": ("Belarus", "#6a9a6a"),
    "lat": ("Latvia", "#8a3a3a"),
    "estl": ("Estonia", "#3a6a8a"),
    "cyp": ("Cyprus", "#d4a04a"),
    "ncy": ("Northern Cyprus", "#c45b2a"),
    "bih": ("Bosnia and Herzegovina", "#3a6a8a"),
    "hrv": ("Croatia", "#c43a3a"),
    "svn": ("Slovenia", "#3a8a6a"),
    "mkd": ("North Macedonia", "#d4a43a"),
    "kos": ("Kosovo", "#3a5a9a"),
    "mda": ("Moldova", "#c4a04a"),
    "aze": ("Azerbaijan", "#3a8a8a"),
    "arm": ("Armenia", "#c45b3a"),
    "geo": ("Georgia", "#c43a3a"),
    "mlt": ("Malta", "#c4b43a"),
    "gib": ("Gibraltar", "#8a2430"),
    "fro": ("Faroe Islands", "#4a6a8a"),
}

SCENARIOS = [
    {
        "id": "1492",
        "label": "1492",
        "blurb": "Crowns and city-states on the eve of the ocean.",
    },
    {
        "id": "1650",
        "label": "1650",
        "blurb": "After Westphalia: a Swedish Baltic and Ottoman Hungary.",
    },
    {
        "id": "1815",
        "label": "1815",
        "blurb": "The Vienna settlement and its restored monarchies.",
    },
    {
        "id": "1914",
        "label": "1914",
        "blurb": "Nation-states in the last summer before the Great War.",
    },
    {
        "id": "1938",
        "label": "1938",
        "blurb": "Late interwar Europe, after Anschluss and the Sudetenland.",
    },
    {
        "id": "modern",
        "label": "Modern",
        "blurb": "A recent atlas sketch, not a live political map.",
    },
]


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return (
        text.lower()
        .replace("ł", "l")
        .replace("ø", "o")
        .replace("đ", "d")
        .replace("ß", "ss")
        .strip()
    )


def _n(name: str) -> str:
    return norm(name)


# --- name sets -----------------------------------------------------------

ARAGON_ES = {
    "huesca", "teruel", "zaragoza", "barcelona", "gerona", "girona", "lerida",
    "lleida", "tarragona", "alicante", "castellon", "valencia", "baleares",
    "islas baleares",
}
NAVARRE_ES = {"navarra", "foral de navarra"}
CEUTA = {"ceuta"}
MELILLA = {"melilla"}

FR_ALSACE = {"bas-rhin", "haut-rhin"}
FR_MOSELLE = {"moselle"}
FR_LORRAINE = {"meurthe-et-moselle", "meuse", "vosges"}
FR_FRANCHE = {"doubs", "jura", "haute-saone", "territoire de belfort"}
FR_NORD = {"nord", "pas-de-calais"}
FR_ROUSSILLON = {"pyrenees-orientales"}
FR_SAVOY = {"savoie", "haute-savoie"}
FR_NICE = {"alpes-maritimes"}
FR_CORSICA = {"corse-du-sud", "haute-corse"}
FR_AVIGNON = {"vaucluse"}

SWE_DANISH = {"skane", "halland", "blekinge", "gotland"}

SCOTLAND_REGIONS = {"eastern", "highlands and islands", "north eastern", "south western"}
WALES_REGIONS = {"east wales", "west wales and the valleys"}

VENICE_LOMBARDY = {"bergamo", "brescia"}
PAPAL_EMILIA = {"bologna", "ferrara", "forli-cesena", "ravenna", "rimini"}
# Ferrara was Este until 1598, so 1492 is Este and 1650 papal.
ESTE_EMILIA = {"ferrara"}
MODENA_EMILIA = {"modena", "reggio emilia"}
PARMA_EMILIA = {"parma", "piacenza"}

TUSCAN_SPECIAL = {
    "siena": ("sie", "tus", "tus", "ita", "ita", "ita"),
    "lucca": ("luc", "luc", "luc", "ita", "ita", "ita"),
    "massa-carrara": ("mod", "mod", "mod", "ita", "ita", "ita"),
}

FRIULI_HAB = {"gorizia", "trieste"}

GERMAN = {
    "sachsen": ("sax", "sax", "sax", "ger", "ger", "ger"),
    "bayern": ("bav", "bav", "bav", "ger", "ger", "ger"),
    "rheinland-pfalz": ("pal", "pal", "pru", "ger", "ger", "ger"),
    "saarland": ("pal", "pal", "pru", "ger", "ger", "ger"),
    "schleswig-holstein": ("den", "den", "den", "ger", "ger", "ger"),
    "niedersachsen": ("han", "han", "han", "ger", "ger", "ger"),
    "nordrhein-westfalen": ("cle", "bra", "pru", "ger", "ger", "ger") if False else ("bra", "bra", "pru", "ger", "ger", "ger"),
    "baden-wurttemberg": ("wur", "wur", "wur", "ger", "ger", "ger"),
    "brandenburg": ("bra", "bra", "pru", "ger", "ger", "ger"),
    "mecklenburg-vorpommern": ("mec", "mec", "mec", "ger", "ger", "ger"),
    "bremen": ("bre", "bre", "bre", "ger", "ger", "ger"),
    "hamburg": ("ham", "ham", "ham", "ger", "ger", "ger"),
    "hessen": ("hes", "hes", "hes", "ger", "ger", "ger"),
    "thuringen": ("thu", "thu", "thu", "ger", "ger", "ger"),
    "sachsen-anhalt": ("anh", "bra", "pru", "ger", "ger", "ger"),
    "berlin": ("bra", "bra", "pru", "ger", "ger", "ger"),
}

# Fix NRW: 1492 is not yet Brandenburg. Use a Cleves/Westphalian tag.
# The conditional above accidentally kept Brandenburg because of `if False`.
GERMAN["nordrhein-westfalen"] = ("jul", "bra", "pru", "ger", "ger", "ger")
GERMAN["sachsen-anhalt"] = ("anh", "bra", "pru", "ger", "ger", "ger")

# Tags referenced above that need catalog entries.
COUNTRIES.update({
    "cle": ("Cleves", "#6a7a5a"),
    "jul": ("Jülich-Cleves", "#6d7f62"),
    "anh": ("Anhalt", "#7a8a4a"),
})

OTTOMAN_HU_REGIONS = {
    "great southern plain",
    "southern transdanubia",
    "central hungary",
}
PARTIUM_HU = {"northern great plain"}
HAB_HU = {
    "western transdanubia",
    "central transdanubia",
    "northern hungary",
}

TRANSYLVANIA = {
    "alba", "cluj", "mures", "sibiu", "brasov", "covasna", "harghita",
    "bistrita-nasaud", "salaj", "hunedoara", "maramures",
}
CRISANA = {"bihor", "arad", "satu mare"}
BANAT = {"timis", "caras-severin"}
BUKOVINA = {"suceava"}
DOBRUJA = {"constanta", "tulcea"}
MOLDAVIA_RO = {
    "botosani", "iasi", "vaslui", "galati", "neamt", "bacau", "vrancea",
}
WALLACHIA = {
    "mehedinti", "dolj", "calarasi", "teleorman", "giurgiu", "olt", "dambovita",
    "ilfov", "arges", "gorj", "valcea", "prahova", "buzau", "braila", "ialomita",
    "bucharest",
}

VOJVODINA_MARKERS = ("backi", "banat", "srem")

DALMATIA = {
    "zadarska", "splitsko-dalmatinska", "sibensko-kninska",
}
SLAVONIA_OTT = {
    "osjecko-baranjska", "vukovarsko-srijemska", "brodsko-posavska",
}
RAGUSA = {"dubrovacko-neretvanska"}
ISTRIA = {"istarska"}

POLAND = {
    "lower silesian": ("boh", "hab", "pru", "ger", "ger", "pol"),
    "opole": ("boh", "hab", "pru", "ger", "ger", "pol"),
    "silesian": ("boh", "hab", "pru", "ger", "pol", "pol"),
    "lesser poland": ("pol", "plc", "aus", "auh", "pol", "pol"),
    "subcarpathian": ("pol", "plc", "aus", "auh", "pol", "pol"),
    "lublin": ("pol", "plc", "rus", "rus", "pol", "pol"),
    "swietokrzyskie": ("pol", "plc", "rus", "rus", "pol", "pol"),
    "masovian": ("pol", "plc", "rus", "rus", "pol", "pol"),
    "lodz": ("pol", "plc", "rus", "rus", "pol", "pol"),
    "podlachian": ("lit", "plc", "rus", "rus", "pol", "pol"),
    "warmian-masurian": ("teu", "pru", "pru", "ger", "ger", "pol"),
    "pomeranian": ("pol", "plc", "pru", "ger", "pol", "pol"),
    "west pomeranian": ("pom", "swe", "pru", "ger", "ger", "pol"),
    "lubusz": ("bra", "bra", "pru", "ger", "ger", "pol"),
    "greater poland": ("pol", "plc", "pru", "ger", "pol", "pol"),
    "kuyavian-pomeranian": ("pol", "plc", "pru", "ger", "pol", "pol"),
}

UKRAINE = {
    "l'viv": ("pol", "plc", "aus", "auh", "pol", "ukr"),
    "ivano-frankivs'k": ("pol", "plc", "aus", "auh", "pol", "ukr"),
    "ternopil'": ("pol", "plc", "aus", "auh", "pol", "ukr"),
    "volyn": ("lit", "plc", "rus", "rus", "pol", "ukr"),
    "rivne": ("lit", "plc", "rus", "rus", "pol", "ukr"),
    "transcarpathia": ("hun", "hab", "aus", "auh", "cze", "ukr"),
    "chernivtsi": ("mol", "mol", "aus", "auh", "rom", "ukr"),
    "odessa": ("ott", "ott", "rus", "rus", "sov", "ukr"),
    "mykolayiv": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "kherson": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "zaporizhzhya": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "donets'k": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "luhans'k": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "dnipropetrovs'k": ("lit", "plc", "rus", "rus", "sov", "ukr"),
    "crimea": ("cri", "cri", "rus", "rus", "sov", "ukr"),
    "sevastopol": ("cri", "cri", "rus", "rus", "sov", "ukr"),
}

# Remaining Ukrainian oblasts default to Lithuania / Commonwealth / Russia / Soviet / Ukraine.
UKRAINE_DEFAULT = ("lit", "plc", "rus", "rus", "sov", "ukr")

BELARUS_POLAND_1938 = {"brest", "grodno"}

CZECH_SUDETEN = {"ustecky", "karlovarsky", "liberecky", "moravskoslezsky"}
SLOVAK_HUNGARY_1938 = {"trnavsky", "nitriansky"}

TURKEY_CLUSTER = {}


def _fill_turkey():
    groups = {
        "Marmara": [
            "edirne", "kirklareli", "tekirdag", "istanbul", "kocaeli", "yalova",
            "sakarya", "duzce", "bolu", "bilecik", "bursa", "balikesir", "canakkale",
        ],
        "Aegean": [
            "izmir", "aydin", "mugla", "manisa", "denizli", "usak", "kutahya",
            "afyonkarahisar",
        ],
        "Mediterranean": [
            "antalya", "burdur", "isparta", "mersin", "adana", "hatay", "osmaniye",
            "k. maras", "kahramanmaras",
        ],
        "Central Anatolia": [
            "ankara", "konya", "kinkkale", "kirikkale", "aksaray", "karaman",
            "kayseri", "nevsehir", "nigde", "kirsehir", "yozgat", "eskisehir",
            "cankiri", "sivas", "kirsehir",
        ],
        "Black Sea": [
            "kastamonu", "sinop", "samsun", "ordu", "giresun", "trabzon", "rize",
            "artvin", "bartin", "zinguldak", "karabuk", "amasya", "tokat", "corum",
            "gumushane", "bayburt",
        ],
        "Eastern Anatolia": [
            "erzurum", "erzincan", "kars", "ardahan", "agri", "igdir", "van", "mus",
            "bitlis", "bingol", "tunceli", "elazig", "malatya",
        ],
        "Southeastern Anatolia": [
            "gaziantep", "kilis", "sanliurfa", "diyarbakir", "mardin", "batman",
            "siirt", "sirnak", "hakkari", "adiyaman",
        ],
    }
    for label, names in groups.items():
        for name in names:
            TURKEY_CLUSTER[name] = label


_fill_turkey()

ROMANIA_CLUSTER = {}
for name in TRANSYLVANIA:
    ROMANIA_CLUSTER[name] = "Transylvania"
for name in CRISANA:
    ROMANIA_CLUSTER[name] = "Crișana"
for name in BANAT:
    ROMANIA_CLUSTER[name] = "Banat"
for name in BUKOVINA:
    ROMANIA_CLUSTER[name] = "Bukovina"
for name in DOBRUJA:
    ROMANIA_CLUSTER[name] = "Dobruja"
for name in MOLDAVIA_RO:
    ROMANIA_CLUSTER[name] = "Moldavia"
for name in WALLACHIA:
    ROMANIA_CLUSTER[name] = "Wallachia"

PIN_NAMES = {
    "berlin", "bremen", "hamburg", "wien", "vienna", "prague", "praha",
    "brussels", "bruxelles", "luxembourg", "andorra", "monaco", "san marino",
    "vatican", "gibraltar", "malta", "liechtenstein", "ceuta", "melilla",
    "paris", "budapest",
}

ENGLISH_NAMES = {
    "bayern": "Bavaria",
    "sachsen": "Saxony",
    "niedersachsen": "Lower Saxony",
    "nordrhein-westfalen": "North Rhine-Westphalia",
    "rheinland-pfalz": "Rhineland-Palatinate",
    "thuringen": "Thuringia",
    "hessen": "Hesse",
    "sachsen-anhalt": "Saxony-Anhalt",
    "mecklenburg-vorpommern": "Mecklenburg",
    "baden-wurttemberg": "Baden-Württemberg",
    "schleswig-holstein": "Schleswig-Holstein",
    "brandenburg": "Brandenburg",
    "wien": "Vienna",
    "steiermark": "Styria",
    "karnten": "Carinthia",
    "tirol": "Tyrol",
    "niederosterreich": "Lower Austria",
    "oberosterreich": "Upper Austria",
    "vorarlberg": "Vorarlberg",
    "salzburg": "Salzburg",
    "burgenland": "Burgenland",
    "bozen": "South Tyrol",
    "aoste": "Aosta Valley",
    "genova": "Genoa",
    "torino": "Turin",
    "turin": "Turin",
    "firenze": "Florence",
    "napoli": "Naples",
    "roma": "Rome",
    "venezia": "Venice",
    "milano": "Milan",
    "mantova": "Mantua",
    "bretagne": "Brittany",
    "normandie": "Normandy",
    "corse": "Corsica",
    "ile-de-france": "Île-de-France",
    "grand est": "Grand Est",
    "nouvelle-aquitaine": "Nouvelle-Aquitaine",
    "occitanie": "Occitanie",
    "provence-alpes-cote d'azur": "Provence",
    "auvergne-rhone-alpes": "Auvergne-Rhône-Alpes",
    "bourgogne-franche-comte": "Burgundy–Franche-Comté",
    "centre-val de loire": "Centre",
    "pays de la loire": "Pays de la Loire",
    "hauts-de-france": "Hauts-de-France",
    "greater london": "Greater London",
    "north west": "North West England",
    "north east": "North East England",
    "south east": "South East England",
    "south west": "South West England",
    "east midlands": "East Midlands",
    "west midlands": "West Midlands",
    "yorkshire and the humber": "Yorkshire",
    "east": "East of England",
    "eastern": "Eastern Scotland",
    "south western": "Southwestern Scotland",
    "north eastern": "Northeastern Scotland",
    "highlands and islands": "Highlands and Islands",
    "east wales": "East Wales",
    "west wales and the valleys": "West Wales",
    "northern ireland": "Northern Ireland",
    "border": "Border Region",
    "south-east": "South-East Ireland",
    "mid-west": "Mid-West Ireland",
    "west": "West of Ireland",
    "midlands": "Irish Midlands",
    "mid-east": "Mid-East Ireland",
    "south-west": "South-West Ireland",
    "kriti": "Crete",
    "ipeiros": "Epirus",
    "thessalia": "Thessaly",
    "attiki": "Attica",
    "sterea ellada": "Central Greece",
    "ionioi nisoi": "Ionian Islands",
    "notio aigaio": "South Aegean",
    "voreio aigaio": "North Aegean",
    "kentriki makedonia": "Central Macedonia",
    "dytiki makedonia": "Western Macedonia",
    "anatoliki makedonia kai thraki": "Macedonia and Thrace",
    "dytiki ellada": "Western Greece",
    "peloponnisos": "Peloponnese",
    "ayion oros": "Mount Athos",
    "seien-et-marne": "Seine-et-Marne",
    "lombardia": "Lombardy",
    "toscana": "Tuscany",
    "piemonte": "Piedmont",
    "sardegna": "Sardinia",
    "sicily": "Sicily",
    "liguria": "Liguria",
    "veneto": "Veneto",
    "lazio": "Lazio",
    "campania": "Campania",
    "calabria": "Calabria",
    "puglia": "Apulia",
    "apulia": "Apulia",
    "emilia-romagna": "Emilia-Romagna",
    "friuli-venezia giulia": "Friuli",
    "trentino-alto adige": "Trentino-Alto Adige",
    "valle d'aosta": "Aosta Valley",
    "cataluna": "Catalonia",
    "andalucia": "Andalusia",
    "castilla y leon": "Castile and León",
    "castilla-la mancha": "Castile-La Mancha",
    "pais vasco": "Basque Country",
    "valenciana": "Valencia",
    "galicia": "Galicia",
    "aragon": "Aragon",
    "islas baleares": "Balearic Islands",
    "madrid": "Madrid",
    "murcia": "Murcia",
    "wallachia": "Wallachia",
    "transylvania": "Transylvania",
    "moldavia": "Moldavia",
    "dobruja": "Dobruja",
    "banat": "Banat",
    "bukovina": "Bukovina",
    "crisana": "Crișana",
    "marmara": "Marmara",
    "aegean": "Aegean Turkey",
    "mediterranean": "Mediterranean Turkey",
    "central anatolia": "Central Anatolia",
    "black sea": "Black Sea Turkey",
    "eastern anatolia": "Eastern Anatolia",
    "southeastern anatolia": "Southeastern Anatolia",
}


def english_name(name: str, *, cluster: str | None = None) -> str:
    key = _n(name)
    if key in ENGLISH_NAMES:
        return ENGLISH_NAMES[key]
    return name


def _six(*ids: str) -> tuple[str, str, str, str, str, str]:
    if len(ids) != 6:
        raise ValueError(ids)
    return ids  # type: ignore[return-value]


def owners_for(props: dict) -> tuple[str, str, str, str, str, str]:
    """Return six polity ids for a source feature."""
    admin = props.get("admin") or ""
    iso = props.get("iso_a2") or ""
    name = props.get("name") or ""
    region = props.get("region") or ""
    key = _n(name)
    reg = _n(region)
    side = props.get("_side")  # cyprus clip: "north" / "south"

    if admin == "United Kingdom" or iso == "GB":
        if reg in SCOTLAND_REGIONS or key in SCOTLAND_REGIONS:
            return _six("sco", "sco", "gbr", "gbr", "gbr", "gbr")
        if reg in WALES_REGIONS or key in WALES_REGIONS:
            return _six("eng", "eng", "gbr", "gbr", "gbr", "gbr")
        if "northern ireland" in reg or "northern ireland" in key:
            return _six("ire", "ire", "gbr", "gbr", "gbr", "gbr")
        return _six("eng", "eng", "gbr", "gbr", "gbr", "gbr")

    if iso in {"JE", "GG", "IM"} or admin in {"Jersey", "Guernsey", "Isle of Man"}:
        return _six("eng", "eng", "gbr", "gbr", "gbr", "gbr")
    if iso == "GI" or key == "gibraltar":
        return _six("cas", "spa", "gbr", "gbr", "gbr", "gib")
    if iso == "IE" or admin == "Ireland":
        return _six("ire", "ire", "gbr", "gbr", "ire", "ire")
    if iso == "FO" or admin == "Faroe Islands":
        return _six("den", "den", "den", "den", "den", "fro")
    if iso == "IS" or admin == "Iceland":
        return _six("den", "den", "den", "den", "den", "isl")
    if iso == "PT" or admin == "Portugal":
        return _six("por", "por", "por", "por", "por", "por")
    if iso == "AD" or key == "andorra":
        return _six("and", "and", "and", "and", "and", "and")
    if iso == "MC" or key == "monaco":
        return _six("mco", "mco", "mco", "mco", "mco", "mco")
    if iso == "SM" or key == "san marino":
        return _six("sma", "sma", "sma", "sma", "sma", "sma")
    if iso == "VA" or "vatican" in key:
        return _six("pap", "pap", "pap", "ita", "ita", "vat")
    if iso == "LI" or key == "liechtenstein":
        return _six("hab", "hab", "aus", "auh", "lie", "lie")
    if iso == "MT" or key == "malta":
        return _six("ara", "kni", "gbr", "gbr", "gbr", "mlt")
    if iso == "LU" or admin == "Luxembourg":
        return _six("hab", "spa", "nld", "lux", "lux", "lux")
    if iso == "CH" or admin == "Switzerland":
        return _six("swi", "swi", "swi", "swi", "swi", "swi")

    if iso == "ES" or admin == "Spain":
        if key in CEUTA:
            return _six("por", "por", "spa", "spa", "spa", "spa")
        if key in MELILLA:
            return _six("cas", "spa", "spa", "spa", "spa", "spa")
        if key in NAVARRE_ES:
            return _six("nav", "spa", "spa", "spa", "spa", "spa")
        if key in ARAGON_ES or reg in {"cataluna", "aragon", "valenciana", "islas baleares"}:
            return _six("ara", "spa", "spa", "spa", "spa", "spa")
        return _six("cas", "spa", "spa", "spa", "spa", "spa")

    if iso == "FR" or admin == "France":
        if key in FR_ALSACE:
            return _six("hab", "fra", "fra", "ger", "fra", "fra")
        if key in FR_MOSELLE:
            return _six("lor", "lor", "fra", "ger", "fra", "fra")
        if key in FR_LORRAINE:
            return _six("lor", "lor", "fra", "fra", "fra", "fra")
        if key in FR_FRANCHE:
            return _six("hab", "spa", "fra", "fra", "fra", "fra")
        if key in FR_NORD:
            return _six("hab", "spa", "fra", "fra", "fra", "fra")
        if key in FR_ROUSSILLON:
            return _six("ara", "spa", "fra", "fra", "fra", "fra")
        if key in FR_SAVOY or key in FR_NICE:
            return _six("sav", "sav", "sar", "fra", "fra", "fra")
        if key in FR_CORSICA:
            return _six("gen", "gen", "fra", "fra", "fra", "fra")
        if key in FR_AVIGNON:
            return _six("pap", "pap", "fra", "fra", "fra", "fra")
        return _six("fra", "fra", "fra", "fra", "fra", "fra")

    if iso == "BE" or admin == "Belgium":
        return _six("hab", "spa", "nld", "bel", "bel", "bel")
    if iso == "NL" or admin == "Netherlands":
        return _six("hab", "ned", "nld", "ned", "ned", "ned")
    if iso == "DE" or admin == "Germany":
        if key in GERMAN:
            return GERMAN[key]
        return _six("hab", "hab", "pru", "ger", "ger", "ger")

    if iso == "AT" or admin == "Austria":
        if key == "burgenland":
            return _six("hun", "hab", "aus", "auh", "ger", "aut")
        return _six("hab", "hab", "aus", "auh", "ger", "aut")

    if iso == "CZ" or admin == "Czech Republic":
        modern_tail = "ger" if key in CZECH_SUDETEN else "cze"
        # 1938 only; modern is the Czech Republic for every kraj.
        owners = ("boh", "hab", "aus", "auh", modern_tail if modern_tail == "ger" else "cze", "cze")
        if key in CZECH_SUDETEN:
            return _six("boh", "hab", "aus", "auh", "ger", "cze")
        return _six("boh", "hab", "aus", "auh", "cze", "cze")

    if iso == "SK" or admin == "Slovakia":
        if key in SLOVAK_HUNGARY_1938:
            return _six("hun", "hab", "aus", "auh", "hun", "svk")
        return _six("hun", "hab", "aus", "auh", "cze", "svk")

    if iso == "HU" or admin == "Hungary":
        if reg in OTTOMAN_HU_REGIONS:
            return _six("hun", "ott", "aus", "auh", "hun", "hun")
        if reg in PARTIUM_HU:
            return _six("hun", "tra", "aus", "auh", "hun", "hun")
        if reg in HAB_HU or True:
            return _six("hun", "hab", "aus", "auh", "hun", "hun")

    if iso == "RO" or admin == "Romania":
        if key in TRANSYLVANIA or key in CRISANA:
            return _six("hun", "tra", "aus", "auh", "rom", "rom")
        if key in BANAT:
            return _six("hun", "ott", "aus", "auh", "rom", "rom")
        if key in BUKOVINA:
            return _six("mol", "mol", "aus", "auh", "rom", "rom")
        if key in DOBRUJA:
            return _six("ott", "ott", "ott", "rom", "rom", "rom")
        if key in MOLDAVIA_RO:
            return _six("mol", "mol", "mol", "rom", "rom", "rom")
        return _six("wal", "wal", "wal", "rom", "rom", "rom")

    if iso == "PL" or admin == "Poland":
        if key in POLAND:
            return POLAND[key]
        return _six("pol", "plc", "rus", "rus", "pol", "pol")

    if iso == "UA" or admin == "Ukraine":
        if key in UKRAINE:
            return UKRAINE[key]
        return UKRAINE_DEFAULT

    if iso == "BY" or admin == "Belarus":
        y1938 = "pol" if key in BELARUS_POLAND_1938 else "sov"
        return _six("lit", "plc", "rus", "rus", y1938, "blr")

    if iso == "LT" or admin == "Lithuania":
        if "klaip" in key:
            return _six("teu", "pru", "pru", "ger", "lit", "lit")
        return _six("lit", "plc", "rus", "rus", "lit", "lit")

    if iso == "LV" or admin == "Latvia":
        if reg in {"kurzeme", "zemgale"} or key in {"kurzeme", "zemgale"}:
            return _six("liv", "cou", "rus", "rus", "lat", "lat")
        if reg == "latgale" or key == "latgale":
            return _six("lit", "plc", "rus", "rus", "lat", "lat")
        return _six("liv", "swe", "rus", "rus", "lat", "lat")

    if iso == "EE" or admin == "Estonia":
        return _six("liv", "swe", "rus", "rus", "estl", "estl")

    if iso == "FI" or admin == "Finland":
        return _six("swe", "swe", "rus", "rus", "fin", "fin")
    if iso == "SE" or admin == "Sweden":
        if key in SWE_DANISH:
            return _six("den", "den", "swe", "swe", "swe", "swe")
        return _six("swe", "swe", "swe", "swe", "swe", "swe")
    if iso == "NO" or admin == "Norway":
        return _six("den", "den", "nor", "nor", "nor", "nor")
    if iso == "DK" or admin == "Denmark":
        return _six("den", "den", "den", "den", "den", "den")

    if iso == "IT" or admin == "Italy":
        if key == "bozen":
            return _six("hab", "hab", "aus", "auh", "ita", "ita")
        if key == "trento":
            return _six("hab", "hab", "aus", "auh", "ita", "ita")
        if key in FRIULI_HAB:
            return _six("hab", "hab", "aus", "auh", "ita", "ita")
        if reg == "friuli-venezia giulia":
            return _six("ven", "ven", "aus", "ita", "ita", "ita")
        if key in VENICE_LOMBARDY:
            return _six("ven", "ven", "aus", "ita", "ita", "ita")
        if key == "mantova":
            return _six("man", "hab", "aus", "ita", "ita", "ita")
        if key == "sondrio":
            return _six("swi", "swi", "swi", "ita", "ita", "ita")
        if reg == "lombardia":
            return _six("mil", "spa", "aus", "ita", "ita", "ita")
        if reg == "veneto":
            return _six("ven", "ven", "aus", "ita", "ita", "ita")
        if key in TUSCAN_SPECIAL:
            return TUSCAN_SPECIAL[key]
        if reg == "toscana":
            return _six("tus", "tus", "tus", "ita", "ita", "ita")
        if key in ESTE_EMILIA:
            return _six("est", "pap", "pap", "ita", "ita", "ita")
        if key in MODENA_EMILIA:
            return _six("mod", "mod", "mod", "ita", "ita", "ita")
        if key in PARMA_EMILIA:
            return _six("mil", "par", "par", "ita", "ita", "ita")
        if key in PAPAL_EMILIA or reg == "emilia-romagna":
            return _six("pap", "pap", "pap", "ita", "ita", "ita")
        if reg in {"piemonte", "valle d'aosta"} or key == "aoste":
            return _six("sav", "sav", "sar", "ita", "ita", "ita")
        if reg == "liguria":
            return _six("gen", "gen", "sar", "ita", "ita", "ita")
        if reg == "sardegna":
            return _six("ara", "spa", "sar", "ita", "ita", "ita")
        if reg == "sicily":
            return _six("ara", "spa", "sic", "ita", "ita", "ita")
        if reg in {"lazio", "umbria", "marche"}:
            return _six("pap", "pap", "pap", "ita", "ita", "ita")
        if reg in {"abruzzo", "molise", "campania", "apulia", "basilicata", "calabria"}:
            return _six("nap", "spa", "sic", "ita", "ita", "ita")
        return _six("ita", "ita", "ita", "ita", "ita", "ita")

    if iso == "SI" or admin == "Slovenia":
        if "obalno" in key or "obalno" in reg:
            return _six("ven", "ven", "aus", "auh", "ita", "svn")
        return _six("hab", "hab", "aus", "auh", "yug", "svn")

    if iso == "HR" or admin == "Croatia":
        if key in RAGUSA:
            return _six("rag", "rag", "aus", "auh", "yug", "hrv")
        if key in ISTRIA:
            return _six("ven", "ven", "aus", "auh", "ita", "hrv")
        if key in DALMATIA:
            return _six("ven", "ven", "aus", "auh", "yug", "hrv")
        if key in SLAVONIA_OTT:
            return _six("hun", "ott", "aus", "auh", "yug", "hrv")
        return _six("hun", "hab", "aus", "auh", "yug", "hrv")

    if iso == "BA" or admin == "Bosnia and Herzegovina":
        return _six("ott", "ott", "ott", "auh", "yug", "bih")

    if iso == "RS" or admin == "Republic of Serbia":
        if any(marker in key for marker in VOJVODINA_MARKERS):
            return _six("hun", "ott", "aus", "auh", "yug", "srp")
        return _six("ott", "ott", "srp", "srp", "yug", "srp")

    if iso == "XK" or admin == "Kosovo":
        return _six("ott", "ott", "ott", "srp", "yug", "kos")
    if iso == "ME" or admin == "Montenegro":
        if key in {"herceg novi", "kotor", "tivat"}:
            return _six("ven", "ven", "aus", "auh", "yug", "mnt")
        return _six("mnt", "mnt", "mnt", "mnt", "yug", "mnt")
    if iso == "MK" or admin == "Macedonia":
        return _six("ott", "ott", "ott", "srp", "yug", "mkd")
    if iso == "AL" or admin == "Albania":
        return _six("ott", "ott", "ott", "alb", "alb", "alb")
    if iso == "BG" or admin == "Bulgaria":
        return _six("ott", "ott", "ott", "bul", "bul", "bul")
    if iso == "GR" or admin == "Greece":
        if key == "kriti":
            return _six("ven", "ven", "ott", "gre", "gre", "gre")
        if key == "ionioi nisoi":
            return _six("ven", "ven", "gbr", "gre", "gre", "gre")
        if key == "voreio aigaio":
            return _six("gen", "ott", "ott", "gre", "gre", "gre")
        if key == "notio aigaio":
            return _six("ven", "ott", "ott", "gre", "gre", "gre")
        return _six("ott", "ott", "ott", "gre", "gre", "gre")

    if iso == "MD" or admin == "Moldova":
        return _six("mol", "mol", "rus", "rus", "rom", "mda")

    if iso == "CY" or admin in {"Cyprus", "Northern Cyprus"} or side:
        modern = "ncy" if side == "north" or admin == "Northern Cyprus" else "cyp"
        return _six("ven", "ott", "ott", "gbr", "gbr", modern)

    if iso == "TR" or admin == "Turkey":
        if key in {"kars", "ardahan", "igdir"}:
            return _six("ott", "ott", "ott", "rus", "tur", "tur")
        if key == "hatay":
            return _six("ott", "ott", "ott", "ott", "fra", "tur")
        return _six("ott", "ott", "ott", "ott", "tur", "tur")

    if iso == "GE" or admin == "Georgia":
        return _six("geo", "geo", "rus", "rus", "sov", "geo")
    if iso == "AM" or admin == "Armenia":
        return _six("per", "per", "per", "rus", "sov", "arm")
    if iso == "AZ" or admin == "Azerbaijan":
        return _six("per", "per", "rus", "rus", "sov", "aze")

    if iso == "RU" or admin == "Russia":
        if "kaliningrad" in key:
            return _six("teu", "pru", "pru", "ger", "ger", "rus")
        if "crimea" in key or "sevastopol" in key:
            return _six("cri", "cri", "rus", "rus", "sov", "ukr")
        if any(token in key for token in (
            "dagestan", "chechn", "ingush", "osseti", "kabard", "karach",
            "adygea", "krasnodar", "stavropol",
        )):
            return _six("cau", "cau", "rus", "rus", "sov", "rus")
        if "tatar" in key:
            return _six("kaz", "rus", "rus", "rus", "sov", "rus")
        if "bashkor" in key:
            return _six("kaz", "rus", "rus", "rus", "sov", "rus")
        if "astrakhan" in key:
            return _six("ast", "rus", "rus", "rus", "sov", "rus")
        if key == "pskov":
            return _six("psk", "rus", "rus", "rus", "sov", "rus")
        if "ryazan" in key or "ryazan" in key:
            return _six("rya", "rus", "rus", "rus", "sov", "rus")
        if "smolensk" in key:
            return _six("lit", "rus", "rus", "rus", "sov", "rus")
        return _six("mos", "rus", "rus", "rus", "sov", "rus")

    return _six("fra", "fra", "fra", "fra", "fra", "fra")


def ensure_lorraine_tag():
    COUNTRIES.setdefault("lor", ("Lorraine", "#7a6a8a"))


ensure_lorraine_tag()


def cluster_for(props: dict) -> str:
    admin = props.get("admin") or ""
    region = props.get("region") or ""
    name = props.get("name") or ""
    key = _n(name)
    if admin == "Turkey" or props.get("iso_a2") == "TR":
        return "Turkey|" + TURKEY_CLUSTER.get(key, "Anatolia")
    if admin == "Romania" or props.get("iso_a2") == "RO":
        return "Romania|" + ROMANIA_CLUSTER.get(key, "Romania")
    if admin == "France" and region:
        return "France|" + region
    if admin == "Italy" and region:
        return "Italy|" + region
    if admin == "Spain" and region:
        return "Spain|" + region
    if admin == "Portugal" and region:
        return "Portugal|" + region
    if admin == "Hungary" and region:
        return "Hungary|" + region
    if admin == "Belgium" and region:
        return "Belgium|" + region
    if region and admin in {
        "Slovenia", "Latvia", "Azerbaijan", "Kosovo", "United Kingdom",
        "Ireland", "Bosnia and Herzegovina", "Macedonia",
    }:
        return f"{admin}|{region}"
    # Small and mid-size countries consolidate within the same ownership.
    if admin in {
        "Bulgaria", "Albania", "Montenegro", "Estonia", "Lithuania",
        "Moldova", "Republic of Serbia", "Croatia", "Czech Republic",
        "Slovakia", "Switzerland", "Netherlands", "Belgium", "Greece",
        "Austria", "Denmark", "Bosnia and Herzegovina",
    }:
        return admin
    return f"{admin}|{name}"


def friendly_cluster(cluster: str) -> str | None:
    if "|" not in cluster:
        return None
    admin, region = cluster.split("|", 1)
    label = english_name(region)
    generic = {
        "Anatolia", "Romania", "Hungary", "Spain", "France", "Italy",
        "Portugal", "Belgium",
    }
    if label in generic or label == admin:
        return None
    if admin == "France":
        return english_name(region)
    if admin in {"Spain", "Italy", "Portugal", "Turkey", "Romania", "Hungary", "Belgium"}:
        return english_name(region)
    if admin == "United Kingdom":
        return english_name(region)
    return label
