(() => {
  // Remplacez ce numéro par votre numéro WhatsApp : 213 puis le numéro sans le zéro initial
  const WHATSAPP_NUMBER = "213771626233";

  const messages = {
    ar: {
      title: "حلول رقمية لتطوير أعمالك",
      intro: "نساعد المحلات والمؤسسات الجزائرية على تطوير حضورها الرقمي.",
      heroBtn: "تواصل معنا عبر WhatsApp",
      servicesTitle: "خدماتنا الرقمية",
      s1: "إنشاء المواقع الإلكترونية", d1: "مواقع احترافية ومتجاوبة مع الهاتف والكمبيوتر لنشاطك التجاري.", p1: "ابتداءً من 8,000 دج",
      s2: "كتالوج إلكتروني", d2: "عرض منتجاتك وخدماتك بطريقة منظمة وسهلة للزبائن.", p2: "ابتداءً من 5,000 دج",
      s3: "ملفات الأعمال", d3: "إعداد ملفات Word وExcel وعروض الأسعار والفواتير.", p3: "حسب الطلب",
      s4: "الصيانة والتحديث", d4: "متابعة موقعك وتحديث المعلومات والخدمات عند الحاجة.", p4: "ابتداءً من 3,000 دج شهرياً",
      s5: "إنشاء التطبيقات", d5: "تطوير تطبيقات Android وiPhone حسب احتياجات مشروعك.", p5: "حسب الطلب",
      s6: "منصات المستشفيات والشركات", d6: "منصات رقمية لإدارة المستشفيات والعيادات والشركات والمؤسسات.", p6: "حسب حجم المشروع",
      contactTitle: "هل تريد تطوير نشاطك التجاري؟",
      contactText: "اتصل بنا الآن لمناقشة مشروعك والحصول على عرض مناسب.",
      contactBtn: "راسلنا عبر WhatsApp"
    },
    fr: {
      title: "Des solutions numériques pour votre entreprise",
      intro: "Nous aidons les commerces et entreprises algériens à développer leur présence numérique.",
      heroBtn: "Contactez-nous sur WhatsApp",
      servicesTitle: "Nos services numériques",
      s1: "Création de sites web", d1: "Des sites professionnels adaptés aux téléphones et ordinateurs.", p1: "À partir de 8 000 DA",
      s2: "Catalogue électronique", d2: "Présentez vos produits et services à vos clients.", p2: "À partir de 5 000 DA",
      s3: "Documents professionnels", d3: "Création de documents Word, Excel, devis et factures.", p3: "Sur demande",
      s4: "Maintenance et mise à jour", d4: "Suivi et actualisation de votre site web.", p4: "À partir de 3 000 DA/mois",
      s5: "Création d'applications", d5: "Développement d'applications Android et iPhone adaptées à votre projet.", p5: "Sur demande",
      s6: "Plateformes pour hôpitaux et entreprises", d6: "Plateformes numériques pour la gestion des hôpitaux, cliniques et entreprises.", p6: "Selon le projet",
      contactTitle: "Vous souhaitez développer votre activité ?",
      contactText: "Contactez-nous pour discuter de votre projet.",
      contactBtn: "Écrivez-nous sur WhatsApp"
    },
    en: {
      title: "Digital solutions for your business",
      intro: "We help Algerian shops and businesses build their digital presence.",
      heroBtn: "Contact us on WhatsApp",
      servicesTitle: "Our Digital Services",
      s1: "Website creation", d1: "Professional websites for phones and computers.", p1: "Starting from 8,000 DZD",
      s2: "Digital catalogue", d2: "Present your products and services to your customers.", p2: "Starting from 5,000 DZD",
      s3: "Business documents", d3: "Word, Excel, quotations and invoice documents.", p3: "On request",
      s4: "Maintenance and updates", d4: "Website maintenance and content updates.", p4: "Starting from 3,000 DZD/month",
      s5: "App development", d5: "Android and iPhone applications tailored to your project.", p5: "On request",
      s6: "Hospital and business platforms", d6: "Digital management platforms for hospitals, clinics and companies.", p6: "Depending on the project",
      contactTitle: "Ready to grow your business?",
      contactText: "Contact us to discuss your project and get an offer.",
      contactBtn: "Message us on WhatsApp"
    }
  };

  // Keep the authored French copy as the source for the default language.
  messages.fr = Object.fromEntries(
    Array.from(document.querySelectorAll("[id]"))
      .filter(element => element.childElementCount === 0)
      .map(element => [element.id, element.textContent])
  );
  Object.assign(messages.fr, {
    servicesTitle: "Tout ce qu’il faut pour passer au niveau supérieur.",
    approachTitle: "Votre projet. Notre savoir-faire. Un vrai travail d’équipe.",
    contactTitle: "Les belles idées méritent de prendre vie."
  });

  Object.assign(messages.en, {
    skipLink: "Skip to content",
    navServices: "Our services", navApproach: "Our approach", navContact: "Let’s talk about your project",
    headerCta: "Have a project in mind?",
    heroLabel: "Your digital partner in Algeria",
    titleStart: "From ambition.", titleMiddle: "To reality.", titleAccent: "Through digital.",
    intro: "Websites, apps and tailored solutions. We turn your ideas into digital experiences that move your business forward.",
    heroBtn: "Let’s talk about your project", discoverBtn: "Explore our services",
    heroNote: "Real people. Solutions designed around you.",
    floatTitle: "Designed for your success", floatText: "From the first click to your next chapter.",
    responsiveTitle: "An experience without limits", responsiveText: "Mobile · Tablet · Desktop",
    tickerLabel: "DIGITAL, FOR EVERY AMBITION.",
    audience1: "Retailers", audience2: "Entrepreneurs", audience3: "Small & large businesses", audience4: "Clinics & institutions",
    servicesLabel: "Our expertise", servicesTitle: "Everything you need to take the next step.",
    servicesIntro: "A clear vision or a blank page? We have a solution to bring your project to life.",
    popularTag: "Your digital essential",
    approachLabel: "Simple, from start to finish",
    approachTitle: "Your project. Our expertise. A real team effort.",
    approachIntro: "No jargon, no unnecessary complexity. Just clear collaboration and a shared goal.",
    step1Title: "We listen", step1Text: "We discuss your business, your vision and your budget to understand what matters.",
    step2Title: "We shape your ideas", step2Text: "We create a tailored solution with you, incorporating your feedback at every step.",
    step3Title: "We stay by your side", step3Text: "From launch to future improvements, we support the next chapter of your journey.",
    contactLabel: "Let’s build what’s next", contactTitle: "Great ideas deserve to come to life.",
    contactText: "Tell us about yours. The first conversation comes with no commitment.",
    contactBtn: "Let’s talk on WhatsApp", contactNote: "A real conversation, with real people.",
    footerCopy: "© 2026 MIC Digital Services. Made in Algeria, for your ambitions.",
    adminLink: "Administrator area"
  });

  Object.assign(messages.ar, {
    skipLink: "انتقل إلى المحتوى",
    navServices: "خدماتنا", navApproach: "طريقة عملنا", navContact: "لنتحدث عن مشروعك",
    headerCta: "لديك فكرة مشروع؟",
    heroLabel: "شريكك الرقمي في الجزائر",
    titleStart: "من الطموح.", titleMiddle: "إلى الواقع.", titleAccent: "بلمسة رقمية.",
    intro: "مواقع وتطبيقات وحلول مصممة لأجلك. نحول أفكارك إلى تجارب رقمية تدفع نشاطك إلى الأمام.",
    heroBtn: "لنتحدث عن مشروعك", discoverBtn: "اكتشف خدماتنا",
    heroNote: "تواصل إنساني. وحلول على مقاس احتياجاتك.",
    floatTitle: "مصمم لنجاحك", floatText: "من أول نقرة إلى خطوتك القادمة.",
    responsiveTitle: "تجربة بلا حدود", responsiveText: "هاتف · جهاز لوحي · حاسوب",
    tickerLabel: "حلول رقمية لكل الطموحات.",
    audience1: "التجار", audience2: "رواد الأعمال", audience3: "المؤسسات والشركات", audience4: "العيادات والمؤسسات",
    servicesLabel: "خبراتنا", servicesTitle: "كل ما تحتاجه للانتقال إلى المستوى التالي.",
    servicesIntro: "فكرة واضحة أم بداية جديدة؟ لدينا الحل لإعطاء الحياة لمشروعك.",
    popularTag: "أساس حضورك الرقمي",
    approachLabel: "ببساطة، من البداية إلى النهاية",
    approachTitle: "مشروعك. خبرتنا. عمل جماعي حقيقي.",
    approachIntro: "دون مصطلحات معقدة أو تعقيدات غير ضرورية. تعاون واضح وهدف مشترك.",
    step1Title: "نستمع إليك", step1Text: "نتحدث عن نشاطك وأفكارك وميزانيتك لفهم ما يهمك حقاً.",
    step2Title: "نحول أفكارك إلى واقع", step2Text: "نصمم حلاً يناسبك، بمشاركتك وملاحظاتك في كل مرحلة.",
    step3Title: "نبقى إلى جانبك", step3Text: "من الإطلاق إلى التطوير، نرافقك في الخطوات القادمة من رحلتك.",
    contactLabel: "لنبنِ الخطوة القادمة معاً",
    contactTitle: "الأفكار الجميلة تستحق أن ترى النور.",
    contactText: "حدثنا عن فكرتك. اللقاء الأول دون أي التزام.",
    contactBtn: "لنتحدث عبر واتساب", contactNote: "حوار حقيقي مع أشخاص حقيقيين.",
    footerCopy: "© 2026 MIC Digital Services. من الجزائر، لأجل طموحاتك.",
    adminLink: "فضاء الإدارة"
  });

  let currentLang = "fr";

  function setLang(lang) {
    const t = messages[lang];
    if (!t) return;

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    currentLang = lang;
    Object.keys(t).filter(id => id !== "title").forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = t[id];
    });
    document.querySelectorAll("[data-lang]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
    });
    document.querySelector("nav").setAttribute("aria-label", {
      fr: "Navigation principale", en: "Main navigation", ar: "التنقل الرئيسي"
    }[lang]);
    document.querySelector(".lang").setAttribute("aria-label", {
      fr: "Langue", en: "Language", ar: "اللغة"
    }[lang]);
    document.querySelector(".visual").setAttribute("aria-label", {
      fr: "Illustration d’un site web moderne adapté à tous les écrans",
      en: "Illustration of a modern website designed for every screen",
      ar: "تصميم توضيحي لموقع عصري يناسب جميع الشاشات"
    }[lang]);
    updateWhatsApp();
  }

  function updateWhatsApp() {
    const number = WHATSAPP_NUMBER.replace(/\D/g, "");
    const valid = number.length >= 10 && !number.includes("X");
    document.querySelectorAll(".wa").forEach(link => {
      const service = link.dataset.service;
      const serviceName = service ? messages[currentLang][service] : "";
      const text = {
        fr: service ? `Bonjour, je souhaite discuter de votre service : ${serviceName}.` : "Bonjour, je souhaite discuter de mon projet avec MIC Digital Services.",
        en: service ? `Hello, I would like to discuss your service: ${serviceName}.` : "Hello, I would like to discuss my project with MIC Digital Services.",
        ar: service ? `السلام عليكم، أريد الاستفسار عن خدمة: ${serviceName}.` : "السلام عليكم، أريد مناقشة مشروعي مع MIC Digital Services."
      }[currentLang];
      link.href = valid ? "https://wa.me/" + number + "?text=" + encodeURIComponent(text) : "#";
      if (!valid) {
        link.onclick = event => {
          event.preventDefault();
        };
      }
    });
  }

  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });

  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("navigation");
  function closeMenu() {
    navigation.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }
  menuButton.addEventListener("click", () => {
    const open = navigation.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  navigation.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && navigation.classList.contains("open")) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".header")) closeMenu();
  });

  setLang("fr");
})();
