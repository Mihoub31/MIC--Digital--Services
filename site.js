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

  function setLang(lang) {
    const t = messages[lang];
    if (!t) return;

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    Object.keys(t).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = t[id];
    });
  }

  function updateWhatsApp() {
    const number = WHATSAPP_NUMBER.replace(/\D/g, "");
    const valid = number.length >= 10 && !number.includes("X");
    const url = valid
      ? "https://wa.me/" + number + "?text=" + encodeURIComponent("السلام عليكم، أريد الاستفسار عن خدمات MIC Digital Services.")
      : "#";

    document.querySelectorAll(".wa").forEach(link => {
      link.href = url;
      if (!valid) {
        link.addEventListener("click", event => {
          event.preventDefault();
          alert("يرجى وضع رقم WhatsApp الصحيح داخل ملف site.js");
        });
      }
    });
  }

  document.querySelectorAll("[data-lang]").forEach(button => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });

  updateWhatsApp();
})();
