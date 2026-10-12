/* =========================================================
   SHANI TRADERS APP — SETTINGS
   Edit only this file to change shop details.
   ========================================================= */
window.SHOP = {
  name: "Shani Traders",
  nameHi: "शनि ट्रेडर्स",
  tagline: "Building material, Saraipali",
  taglineHi: "बिल्डिंग मटेरियल, सरायपाली",

  // WhatsApp number with country code, digits only (91 + 10-digit mobile)
  whatsapp: "919399893129",
  phone: "+91 93998 93129",
  email: "shanitraders52@gmail.com",

  address: "Main Road, Patsendri, Saraipali, Dist. Mahasamund, Chhattisgarh",
  addressHi: "मेन रोड, पटसेंद्री, सरायपाली, ज़िला महासमुंद, छत्तीसगढ़",
  gstin: "22HEPPP0273E1ZH",
  hours: "Monday to Saturday, 8 am to 8 pm",
  hoursHi: "सोमवार से शनिवार, सुबह 8 से रात 8 बजे",

  // Language for a first-time user: "en", "hi", or "auto" (Hindi if the phone is set to Hindi)
  defaultLang: "auto",
  mapQuery: "Patsendri, Saraipali, Mahasamund, Chhattisgarh",

  // Paste the Google Apps Script Web App URL here (ends with /exec).
  apiUrl: "https://script.google.com/macros/s/AKfycbx4-LLOOYhSBMiqe9-MOBjXp53IfkUG_TDUmvLQx3cfq1deY-WeYXCpOHnQtZO5Z7-C/exec",

  // How often the app re-checks prices in the background (minutes)
  cacheMinutes: 10,

  credit: { name: "Weave Solutions", url: "https://weavesolution.com" }
};

/* Categories are managed in master control (Categories tab). This list is only used
   if the Categories sheet is empty or cannot be reached. */
window.CATEGORIES = [
  { id: "cement", icon: "cement", name: "Cement", nameHi: "सीमेंट" },
  { id: "steel", icon: "steel", name: "Sariya & binding wire", nameHi: "सरिया और बाइंडिंग तार" },
  { id: "sand", icon: "sand", name: "Sand, gitti & bricks", nameHi: "रेत, गिट्टी और ईंट" },
  { id: "ms", icon: "ms", name: "MS pipes, angles & sheets", nameHi: "MS पाइप, एंगल और चादर" },
  { id: "garden", icon: "garden", name: "Garden pipes, pots & fencing", nameHi: "गार्डन पाइप, गमले और तार-बाड़" },
  { id: "sanitary", icon: "sanitary", name: "Sanitary & plumbing", nameHi: "सैनिटरी और प्लंबिंग" },
  { id: "bathroom", icon: "bathroom", name: "Bathroom fittings", nameHi: "बाथरूम फ़िटिंग" },
  { id: "kitchen", icon: "kitchen", name: "Kitchen fittings", nameHi: "किचन फ़िटिंग" },
  { id: "doors", icon: "doors", name: "Doors, windows & curtains", nameHi: "दरवाज़े, खिड़की और पर्दे" },
  { id: "power", icon: "power", name: "Power tools & machines", nameHi: "मशीन और पावर टूल" },
  { id: "paints", icon: "paints", name: "Paint, wallpaper & brushes", nameHi: "पेंट, वॉलपेपर और ब्रश" },
  { id: "electrical", icon: "electrical", name: "Electrical fittings & wires", nameHi: "बिजली की फ़िटिंग और तार" },
  { id: "fasteners", icon: "fasteners", name: "Screws, nails & fasteners", nameHi: "स्क्रू, कील और फ़ास्टनर" },
  { id: "tiles", icon: "tiles", name: "Tiles & flooring", nameHi: "टाइल्स और फ़्लोरिंग" },
  { id: "site", icon: "site", name: "Mason tools & site supplies", nameHi: "मिस्त्री औज़ार और साइट का सामान" },
  { id: "other", icon: "other", name: "Other items", nameHi: "अन्य सामान" }
];
