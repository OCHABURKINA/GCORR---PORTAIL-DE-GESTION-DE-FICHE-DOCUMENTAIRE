import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";

import {
  CONFIG,
} from "./config.js";

/* ==========================================================
   1. INITIALISATION SUPABASE
   ========================================================== */

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/* ==========================================================
   2. ETAT GLOBAL DE L'APPLICATION
   ========================================================== */

const state = {
  session: null,
  isAdmin: false,
  adminProfile: null,

  organizations: [],
  alerts: [],
  alertCommuneOptions: [],
  documents: [],

  adminOrganizations: [],
  adminAlerts: [],

  selectedPublishAlert: null,
  selectedPublishCommune: null,
};

/* ==========================================================
   3. OUTILS GENERAUX
   ========================================================== */

function getElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFileName(fileName) {
  const lastDotIndex = fileName.lastIndexOf(".");

  const extension =
    lastDotIndex >= 0
      ? fileName
          .slice(lastDotIndex)
          .toLowerCase()
      : ".pdf";

  const baseName =
    lastDotIndex >= 0
      ? fileName.slice(0, lastDotIndex)
      : fileName;

  const safeBaseName =
    slugify(baseName) || "document";

  return `${safeBaseName}${extension}`;
}

function formatFileSize(bytes) {
  const numericValue =
    Number(bytes) || 0;

  if (numericValue <= 0) {
    return "0 octet";
  }

  const units = [
    "octets",
    "Ko",
    "Mo",
    "Go",
  ];

  let value = numericValue;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals =
    unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function showMessage(
  element,
  message,
  type = "success"
) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className =
    `message message-${type}`;
}

function hideMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.className =
    "message hidden";
}

function setButtonLoading(
  button,
  isLoading,
  loadingText = "Traitement..."
) {
  if (!button) {
    return;
  }

  if (isLoading) {
    if (
      !button.dataset.originalText
    ) {
      button.dataset.originalText =
        button.textContent;
    }

    button.disabled = true;
    button.textContent =
      loadingText;
  } else {
    button.disabled = false;

    button.textContent =
      button.dataset.originalText ||
      button.textContent;
  }
}

function validatePdf(file) {
  if (!file) {
    throw new Error(
      "Veuillez sélectionner un fichier PDF."
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  const isPdf =
    file.type === "application/pdf" ||
    extension === "pdf";

  if (!isPdf) {
    throw new Error(
      "Seuls les fichiers PDF sont autorisés."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "Le fichier sélectionné est vide."
    );
  }

  if (
    file.size >
    CONFIG.MAX_FILE_SIZE
  ) {
    throw new Error(
      "La taille maximale autorisée est de 20 Mo."
    );
  }
}

function getPublicUrl(storagePath) {
  if (!storagePath) {
    return "";
  }

  const {
    data,
  } = supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || "";
}

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value ?? "").trim()
        )
        .filter(Boolean)
    ),
  ].sort((a, b) =>
    a.localeCompare(
      b,
      "fr",
      {
        sensitivity: "base",
      }
    )
  );
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getAlertById(alertId) {
  return state.alerts.find(
    (item) =>
      item.id === alertId
  ) || null;
}

function getAlertCommuneById(
  alertCommuneId
) {
  return state.alertCommuneOptions.find(
    (item) =>
      item.alert_commune_id ===
      alertCommuneId
  ) || null;
}

function getAlertCommunes(
  alertId,
  activeOnly = true
) {
  return state.alertCommuneOptions.filter(
    (item) => {
      const matchesAlert =
        item.alert_id === alertId;

      if (!activeOnly) {
        return matchesAlert;
      }

      return (
        matchesAlert &&
        item.alert_is_active &&
        item.alert_commune_is_active
      );
    }
  );
}

/* ==========================================================
   4. NAVIGATION
   ========================================================== */

function showView(viewName) {
  if (
    viewName === "admin" &&
    !state.isAdmin
  ) {
    openLoginModal();
    return;
  }

  document
    .querySelectorAll(".view")
    .forEach((view) => {
      view.classList.remove(
        "active-view"
      );
    });

  const targetView =
    getElement(`${viewName}View`);

  if (targetView) {
    targetView.classList.add(
      "active-view"
    );
  }

  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view ===
          viewName
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  if (viewName === "documents") {
    renderDocuments();
  }

  if (
    viewName === "admin" &&
    state.isAdmin
  ) {
    loadAdminData();
  }
}

function initializeNavigation() {
  document
    .querySelectorAll("[data-view]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        () => {
          showView(
            element.dataset.view
          );
        }
      );
    });
}

/* ==========================================================
   5. AUTHENTIFICATION ADMINISTRATEUR
   ========================================================== */

async function initializeAuthentication() {
  const {
    data,
    error,
  } =
    await supabase.auth.getSession();

  if (error) {
    console.error(
      "Erreur session :",
      error
    );
  }

  state.session =
    data?.session || null;

  await checkAdminStatus();

  supabase.auth.onAuthStateChange(
    async (_event, session) => {
      state.session = session;

      await checkAdminStatus();

      try {
        await loadDocuments();

        if (state.isAdmin) {
          await loadAdminData();
        }
      } catch (error) {
        console.error(
          "Erreur après changement de session :",
          error
        );
      }
    }
  );
}

async function checkAdminStatus() {
  state.isAdmin = false;
  state.adminProfile = null;

  if (!state.session?.user?.id) {
    updateAuthenticationInterface();
    return;
  }

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      role
    `)
    .eq(
      "id",
      state.session.user.id
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Erreur vérification administrateur :",
      error
    );

    updateAuthenticationInterface();
    return;
  }

  state.adminProfile =
    data || null;

  state.isAdmin =
    data?.role === "admin";

  updateAuthenticationInterface();
}

function updateAuthenticationInterface() {
  const loginButton =
    getElement("loginButton");

  const logoutButton =
    getElement("logoutButton");

  document
    .querySelectorAll(".admin-only")
    .forEach((element) => {
      element.classList.toggle(
        "hidden",
        !state.isAdmin
      );
    });

  loginButton?.classList.toggle(
    "hidden",
    state.isAdmin
  );

  logoutButton?.classList.toggle(
    "hidden",
    !state.isAdmin
  );

  const adminIdentity =
    getElement("adminIdentity");

  if (!adminIdentity) {
    return;
  }

  if (state.isAdmin) {
    const identity =
      state.adminProfile
        ?.full_name ||
      state.session
        ?.user
        ?.email ||
      "Administrateur";

    adminIdentity.textContent =
      `Connecté en tant que ${identity}.`;
  } else {
    adminIdentity.textContent = "";
  }
}

function openLoginModal() {
  const modal =
    getElement("loginModal");

  if (!modal) {
    return;
  }

  modal.classList.remove("hidden");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  window.setTimeout(() => {
    getElement("adminEmail")
      ?.focus();
  }, 100);
}

function closeLoginModal() {
  const modal =
    getElement("loginModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  hideMessage(
    getElement("loginMessage")
  );
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const loginButton =
    event.submitter;

  const messageElement =
    getElement("loginMessage");

  hideMessage(messageElement);

  const email =
    getElement("adminEmail")
      ?.value
      .trim();

  const password =
    getElement("adminPassword")
      ?.value;

  if (!email || !password) {
    showMessage(
      messageElement,
      "Veuillez renseigner l’adresse e-mail et le mot de passe.",
      "error"
    );

    return;
  }

  setButtonLoading(
    loginButton,
    true,
    "Connexion..."
  );

  try {
    const {
      data,
      error,
    } =
      await supabase.auth
        .signInWithPassword({
          email,
          password,
        });

    if (error) {
      throw error;
    }

    state.session =
      data.session;

    await checkAdminStatus();

    if (!state.isAdmin) {
      await supabase.auth.signOut();

      throw new Error(
        "Ce compte ne possède pas le rôle administrateur."
      );
    }

    getElement("loginForm")
      ?.reset();

    closeLoginModal();

    await loadAdminData();

    showView("admin");
  } catch (error) {
    showMessage(
      messageElement,
      error.message ||
        "Connexion impossible.",
      "error"
    );
  } finally {
    setButtonLoading(
      loginButton,
      false
    );
  }
}

async function handleLogout() {
  const {
    error,
  } =
    await supabase.auth.signOut();

  if (error) {
    window.alert(
      `Déconnexion impossible : ${error.message}`
    );

    return;
  }

  state.session = null;
  state.isAdmin = false;
  state.adminProfile = null;

  state.adminOrganizations = [];
  state.adminAlerts = [];

  updateAuthenticationInterface();

  showView("home");
}

/* ==========================================================
   6. CHARGEMENT DES ORGANISATIONS PUBLIQUES
   ========================================================== */

async function loadPublicOrganizations() {
  const {
    data,
    error,
  } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      acronym,
      slug,
      is_active
    `)
    .eq("is_active", true)
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les organisations : ${error.message}`
    );
  }

  state.organizations =
    data || [];

  populateOrganizationSelects();
}

/* ==========================================================
   7. CHARGEMENT DES ALERTES ET COMMUNES PUBLIQUES
   ========================================================== */

async function loadPublicAlerts() {
  const {
    data,
    error,
  } = await supabase
    .from("alerts")
    .select(`
      id,
      alert_code,
      region,
      is_active,
      created_at,
      updated_at
    `)
    .eq("is_active", true)
    .order("alert_code", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les Alertes ID : ${error.message}`
    );
  }

  state.alerts =
    data || [];

  populatePublishAlertSelect();
  populateAlertFilters();
}

async function loadPublicAlertCommuneOptions() {
  const {
    data,
    error,
  } = await supabase
    .from("alert_commune_options")
    .select(`
      alert_commune_id,
      alert_id,
      alert_code,
      region,
      commune
    `)
    .order("alert_code", {
      ascending: true,
    })
    .order("commune", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les communes des alertes : ${error.message}`
    );
  }

  state.alertCommuneOptions =
    (data || []).map(
      (item) => ({
        ...item,

        /*
         * Valeurs par défaut, car ces colonnes
         * ne sont pas présentes dans la vue actuelle.
         */
        alert_is_active: true,
        alert_commune_is_active: true,
      })
    );

  populatePublishCommuneSelect(
    getElement("publishAlert")?.value || ""
  );

  populateDocumentFilters();
}
/* ==========================================================
   8. REMPLISSAGE DES LISTES DEROULANTES
   ========================================================== */

function populateOrganizationSelects() {
  const selectConfigurations = [
    {
      id: "publishOrganization",
      label:
        "Sélectionner une organisation",
    },
    {
      id: "filterOrganization",
      label:
        "Toutes les organisations",
    },
  ];

  selectConfigurations.forEach(
    ({ id, label }) => {
      const select =
        getElement(id);

      if (!select) {
        return;
      }

      const currentValue =
        select.value;

      select.innerHTML =
        `<option value="">${escapeHtml(label)}</option>`;

      state.organizations.forEach(
        (organization) => {
          const option =
            document.createElement(
              "option"
            );

          option.value =
            organization.id;

          option.textContent =
            organization.acronym
              ? `${organization.name} (${organization.acronym})`
              : organization.name;

          select.appendChild(
            option
          );
        }
      );

      if (
        state.organizations.some(
          (organization) =>
            organization.id ===
            currentValue
        )
      ) {
        select.value =
          currentValue;
      }
    }
  );
}

function populatePublishAlertSelect() {
  const select =
    getElement("publishAlert");

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = `
    <option value="">
      Sélectionner une Alerte ID
    </option>
  `;

  state.alerts.forEach(
    (alertItem) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        alertItem.id;

      option.textContent =
        alertItem.region
          ? `${alertItem.alert_code} — ${alertItem.region}`
          : alertItem.alert_code;

      select.appendChild(option);
    }
  );

  select.disabled =
    state.alerts.length === 0;

  if (
    state.alerts.some(
      (alertItem) =>
        alertItem.id ===
        currentValue
    )
  ) {
    select.value =
      currentValue;
  }
}

function populateAlertFilters() {
  const alertSelect =
    getElement("filterAlert");

  if (!alertSelect) {
    return;
  }

  const currentValue =
    alertSelect.value;

  alertSelect.innerHTML = `
    <option value="">
      Toutes les alertes
    </option>
  `;

  state.alerts.forEach(
    (alertItem) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        alertItem.alert_code;

      option.textContent =
        alertItem.alert_code;

      alertSelect.appendChild(option);
    }
  );

  if (
    state.alerts.some(
      (alertItem) =>
        alertItem.alert_code ===
        currentValue
    )
  ) {
    alertSelect.value =
      currentValue;
  }
}

function populatePublishCommuneSelect(
  alertId
) {
  const communeSelect =
    getElement("publishCommune");

  if (!communeSelect) {
    return;
  }

  communeSelect.innerHTML = `
    <option value="">
      Sélectionner une commune
    </option>
  `;

  if (!alertId) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;

    return;
  }

  const matchingCommunes =
    getAlertCommunes(alertId);

  matchingCommunes.forEach(
    (item) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        item.alert_commune_id;

      option.textContent =
        item.commune;

      communeSelect.appendChild(
        option
      );
    }
  );

  if (
    matchingCommunes.length === 0
  ) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Aucune commune disponible
      </option>
    `;
  } else {
    communeSelect.disabled = false;
  }
}
/* ==========================================================
   9. FORMULAIRE PUBLIC DE PUBLICATION
   ========================================================== */

/**
 * Réinitialise les informations liées à l’alerte
 * et à la commune sélectionnées.
 */
function resetPublishAlertSelection() {
  state.selectedPublishAlert = null;
  state.selectedPublishCommune = null;

  const alertSelect =
    getElement("publishAlert");

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  if (alertSelect) {
    alertSelect.value = "";
  }

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }
}

/**
 * Réinitialise uniquement les métadonnées
 * Région et Commune.
 */
function resetPublishMetadata() {
  state.selectedPublishAlert = null;
  state.selectedPublishCommune = null;

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }
}

/**
 * L’organisation est indépendante de l’alerte.
 * Son changement ne filtre donc plus les Alertes ID.
 */
function handlePublishOrganizationChange() {
  updatePublishSummary();
}

/**
 * Lorsqu’une alerte est sélectionnée :
 * - la région est affichée automatiquement ;
 * - les communes associées sont chargées ;
 * - la commune précédemment sélectionnée est réinitialisée.
 */
function handlePublishAlertChange() {
  const alertId =
    getElement("publishAlert")
      ?.value || "";

  state.selectedPublishAlert =
    getAlertById(alertId);

  state.selectedPublishCommune =
    null;

  const regionInput =
    getElement("publishRegion");

  if (regionInput) {
    regionInput.value =
      state.selectedPublishAlert
        ?.region || "";
  }

  populatePublishCommuneSelect(
    alertId
  );

  updatePublishSummary();
}

/**
 * Enregistre la commune sélectionnée dans l’état global.
 */
function handlePublishCommuneChange() {
  const alertCommuneId =
    getElement("publishCommune")
      ?.value || "";

  state.selectedPublishCommune =
    getAlertCommuneById(
      alertCommuneId
    );

  /*
   * Vérification de cohérence :
   * la commune sélectionnée doit appartenir
   * à l’alerte actuellement sélectionnée.
   */
  if (
    state.selectedPublishCommune &&
    state.selectedPublishAlert &&
    state.selectedPublishCommune
      .alert_id !==
      state.selectedPublishAlert.id
  ) {
    state.selectedPublishCommune =
      null;

    const communeSelect =
      getElement("publishCommune");

    if (communeSelect) {
      communeSelect.value = "";
    }
  }

  updatePublishSummary();
}

/**
 * Gère la sélection du fichier PDF.
 */
function handlePublishFileChange() {
  const fileInput =
    getElement("publishFile");

  const file =
    fileInput?.files?.[0];

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  if (!fileInfo) {
    updatePublishSummary();
    return;
  }

  if (!file) {
    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";

    updatePublishSummary();
    return;
  }

  try {
    validatePdf(file);

    fileInfo.innerHTML = `
      <strong>
        ${escapeHtml(file.name)}
      </strong>

      <span>
        ${formatFileSize(file.size)}
      </span>
    `;

    fileInfo.classList.remove(
      "hidden"
    );
  } catch (error) {
    if (fileInput) {
      fileInput.value = "";
    }

    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";

    window.alert(
      error.message
    );
  }

  updatePublishSummary();
}

/**
 * Met à jour le résumé affiché
 * avant la publication.
 */
function updatePublishSummary() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value || "";

  const organization =
    state.organizations.find(
      (item) =>
        item.id === organizationId
    ) || null;

  const file =
    getElement("publishFile")
      ?.files?.[0];

  const summaryOrganization =
    getElement(
      "summaryOrganization"
    );

  const summaryAlert =
    getElement("summaryAlert");

  const summaryRegion =
    getElement("summaryRegion");

  const summaryCommune =
    getElement("summaryCommune");

  const summaryFile =
    getElement("summaryFile");

  if (summaryOrganization) {
    summaryOrganization.textContent =
      organization?.name || "—";
  }

  if (summaryAlert) {
    summaryAlert.textContent =
      state.selectedPublishAlert
        ?.alert_code || "—";
  }

  if (summaryRegion) {
    summaryRegion.textContent =
      state.selectedPublishAlert
        ?.region || "—";
  }

  if (summaryCommune) {
    summaryCommune.textContent =
      state.selectedPublishCommune
        ?.commune || "—";
  }

  if (summaryFile) {
    summaryFile.textContent =
      file?.name || "—";
  }
}

/* ==========================================================
   10. BARRE DE PROGRESSION DE PUBLICATION
   ========================================================== */

function updatePublishProgress(
  value
) {
  const wrapper =
    getElement(
      "publishProgressWrapper"
    );

  const bar =
    getElement(
      "publishProgressBar"
    );

  const text =
    getElement(
      "publishProgressText"
    );

  if (!wrapper || !bar || !text) {
    return;
  }

  const normalizedValue =
    Math.min(
      100,
      Math.max(
        0,
        Number(value) || 0
      )
    );

  wrapper.classList.remove(
    "hidden"
  );

  bar.style.width =
    `${normalizedValue}%`;

  text.textContent =
    `${normalizedValue} %`;
}

function resetPublishProgress() {
  const wrapper =
    getElement(
      "publishProgressWrapper"
    );

  const bar =
    getElement(
      "publishProgressBar"
    );

  const text =
    getElement(
      "publishProgressText"
    );

  wrapper?.classList.add(
    "hidden"
  );

  if (bar) {
    bar.style.width = "0%";
  }

  if (text) {
    text.textContent = "0 %";
  }
}

/* ==========================================================
   11. GENERATION DU CHEMIN STORAGE
   ========================================================== */

/**
 * Construit un chemin Storage lisible et unique :
 *
 * organisation/
 * alerte/
 * commune/
 * fichier.pdf
 */
function buildDocumentStoragePath({
  organization,
  alertOption,
  communeOption,
  file,
}) {
  const organizationFolder =
    slugify(
      organization.acronym ||
      organization.name
    ) || "organisation";

  const alertFolder =
    slugify(
      alertOption.alert_code
    ) || "alerte";

  const communeFolder =
    slugify(
      communeOption.commune
    ) || "commune";

  const safeFileName =
    sanitizeFileName(
      file.name
    );

  const uniqueFileName =
    [
      Date.now(),
      crypto.randomUUID(),
      safeFileName,
    ].join("-");

  return [
    organizationFolder,
    alertFolder,
    communeFolder,
    uniqueFileName,
  ].join("/");
}

/* ==========================================================
   12. VALIDATION DU FORMULAIRE DE PUBLICATION
   ========================================================== */

function validatePublicationSelection({
  organization,
  alertOption,
  communeOption,
  file,
}) {
  if (!organization) {
    throw new Error(
      "Veuillez sélectionner une organisation."
    );
  }

  if (!alertOption) {
    throw new Error(
      "Veuillez sélectionner une Alerte ID valide."
    );
  }

  if (!communeOption) {
    throw new Error(
      "Veuillez sélectionner une commune."
    );
  }

  if (
    communeOption.alert_id !==
    alertOption.id
  ) {
    throw new Error(
      "La commune sélectionnée ne correspond pas à l’Alerte ID choisie."
    );
  }

  if (
    communeOption.region &&
    alertOption.region &&
    communeOption.region !==
      alertOption.region
  ) {
    throw new Error(
      "La région de la commune ne correspond pas à celle de l’alerte."
    );
  }

  validatePdf(file);
}

/* ==========================================================
   13. PUBLICATION DU DOCUMENT
   ========================================================== */

async function handlePublicPublication(
  event
) {
  event.preventDefault();

  const messageElement =
    getElement("publishMessage");

  const submitButton =
    event.submitter ||
    getElement(
      "publishSubmitButton"
    );

  hideMessage(
    messageElement
  );

  let uploadedStoragePath =
    null;

  let documentInserted =
    false;

  try {
    const organizationId =
      getElement(
        "publishOrganization"
      )?.value || "";

    const alertId =
      getElement("publishAlert")
        ?.value || "";

    const alertCommuneId =
      getElement("publishCommune")
        ?.value || "";

    const file =
      getElement("publishFile")
        ?.files?.[0];

    const organization =
      state.organizations.find(
        (item) =>
          item.id ===
          organizationId
      ) || null;

    const alertOption =
      getAlertById(
        alertId
      );

    const communeOption =
      getAlertCommuneById(
        alertCommuneId
      );

    validatePublicationSelection({
      organization,
      alertOption,
      communeOption,
      file,
    });

    /*
     * Maintien de l’état global
     * avant le début de l’opération.
     */
    state.selectedPublishAlert =
      alertOption;

    state.selectedPublishCommune =
      communeOption;

    setButtonLoading(
      submitButton,
      true,
      "Publication..."
    );

    updatePublishProgress(10);

    const storagePath =
      buildDocumentStoragePath({
        organization,
        alertOption,
        communeOption,
        file,
      });

    uploadedStoragePath =
      storagePath;

    /*
     * Étape 1 : chargement du PDF
     * dans Supabase Storage.
     */
    const {
      error: uploadError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .upload(
        storagePath,
        file,
        {
          cacheControl: "3600",
          contentType:
            "application/pdf",
          upsert: false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Chargement du fichier impossible : ${uploadError.message}`
      );
    }

    updatePublishProgress(65);

    /*
     * Étape 2 : enregistrement
     * des métadonnées.
     *
     * Aucun secteur ni aucune province
     * n’est enregistré.
     */
    const documentRecord = {
      organization_id:
        organization.id,

      alert_id:
        alertOption.id,

      alert_commune_id:
        communeOption
          .alert_commune_id,

      organization_name:
        organization.name,

      alert_code:
        alertOption.alert_code,

      file_name:
        file.name,

      storage_path:
        storagePath,

      file_size:
        file.size,

      mime_type:
        "application/pdf",

      publication_status:
        "published",

      uploaded_by:
        state.session
          ?.user
          ?.id || null,
    };

    const {
      error: insertError,
    } = await supabase
      .from("documents")
      .insert(
        documentRecord
      );

    if (insertError) {
      /*
       * Annulation du chargement Storage
       * lorsque l’écriture dans la base échoue.
       */
      const {
        error: rollbackError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          storagePath,
        ]);

      if (rollbackError) {
        console.warn(
          "Le fichier chargé n’a pas pu être supprimé après l’échec de l’enregistrement :",
          rollbackError.message
        );
      } else {
        uploadedStoragePath =
          null;
      }

      throw new Error(
        `Enregistrement des métadonnées impossible : ${insertError.message}`
      );
    }

    documentInserted = true;

    updatePublishProgress(100);

    showMessage(
      messageElement,
      "La fiche a été publiée avec succès.",
      "success"
    );

    /*
     * Réinitialisation complète
     * du formulaire.
     */
    resetPublishForm();

    /*
     * Actualisation de la liste publique
     * et des statistiques.
     */
    await loadDocuments();
  } catch (error) {
    if (
      uploadedStoragePath &&
      !documentInserted
    ) {
      console.warn(
        "Un fichier peut être resté dans Supabase Storage :",
        uploadedStoragePath
      );
    }

    showMessage(
      messageElement,
      error.message ||
        "Impossible de publier la fiche.",
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );

    window.setTimeout(
      resetPublishProgress,
      1200
    );
  }
}

/* ==========================================================
   14. REINITIALISATION DU FORMULAIRE DE PUBLICATION
   ========================================================== */

function resetPublishForm() {
  const form =
    getElement("publishForm");

  form?.reset();

  state.selectedPublishAlert =
    null;

  state.selectedPublishCommune =
    null;

  const alertSelect =
    getElement("publishAlert");

  const regionInput =
    getElement("publishRegion");

  const communeSelect =
    getElement("publishCommune");

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  /*
   * Les alertes restent accessibles,
   * car elles ne dépendent plus
   * de l’organisation.
   */
  if (alertSelect) {
    alertSelect.value = "";

    alertSelect.disabled =
      state.alerts.length === 0;
  }

  if (regionInput) {
    regionInput.value = "";
  }

  if (communeSelect) {
    communeSelect.value = "";
    communeSelect.disabled = true;

    communeSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord une Alerte ID
      </option>
    `;
  }

  if (fileInfo) {
    fileInfo.classList.add(
      "hidden"
    );

    fileInfo.innerHTML = "";
  }

  updatePublishSummary();
}
/* ==========================================================
   15. CHARGEMENT DES DOCUMENTS
   ========================================================== */

/**
 * Charge les documents depuis Supabase.
 *
 * La table documents contient désormais :
 * - organization_id
 * - alert_id
 * - alert_commune_id
 * - organization_name
 * - alert_code
 * - métadonnées du fichier
 *
 * La région et la commune sont récupérées depuis
 * state.alertCommuneOptions.
 */
async function loadDocuments() {
  let query = supabase
    .from("documents")
    .select(`
      id,
      organization_id,
      alert_id,
      alert_commune_id,
      organization_name,
      alert_code,
      file_name,
      storage_path,
      file_size,
      mime_type,
      publication_status,
      uploaded_by,
      created_at,
      updated_at
    `)
    .order("created_at", {
      ascending: false,
    });

  /*
   * Un visiteur non administrateur ne voit
   * que les documents publiés.
   */
  if (!state.isAdmin) {
    query = query.eq(
      "publication_status",
      "published"
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `Impossible de charger les documents : ${error.message}`
    );
  }

  /*
   * Enrichissement des documents avec :
   * - region
   * - commune
   * - état de la commune
   *
   * Ces informations proviennent de la vue
   * alert_commune_options.
   */
  state.documents =
    enrichDocuments(
      data || []
    );

  renderDocuments();
  renderStatistics();
  populateDocumentFilters();

  if (state.isAdmin) {
    renderAdminDocuments();
  }
}

/* ==========================================================
   16. ENRICHISSEMENT DES DOCUMENTS
   ========================================================== */

/**
 * Ajoute aux documents les informations géographiques
 * provenant de alert_commune_options.
 */
function enrichDocuments(documents) {
  const communeOptionsById =
    new Map(
      state.alertCommuneOptions.map(
        (item) => [
          item.alert_commune_id,
          item,
        ]
      )
    );

  const alertsById =
    new Map(
      state.alerts.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  return documents.map(
    (documentItem) => {
      const communeOption =
        communeOptionsById.get(
          documentItem
            .alert_commune_id
        ) || null;

      const alertOption =
        alertsById.get(
          documentItem.alert_id
        ) || null;

      return {
        ...documentItem,

        /*
         * Priorité à la vue alert_commune_options.
         * La table alerts sert de solution de repli
         * pour la région.
         */
        region:
          communeOption?.region ||
          alertOption?.region ||
          "",

        commune:
          communeOption?.commune ||
          "",

        alert_commune_is_active:
          communeOption
            ?.alert_commune_is_active ??
          null,

        alert_is_active:
          communeOption
            ?.alert_is_active ??
          alertOption?.is_active ??
          null,
      };
    }
  );
}

/**
 * Réapplique l’enrichissement aux documents déjà chargés.
 *
 * Cette fonction est utile lorsque les alertes ou les communes
 * sont actualisées après le chargement initial des documents.
 */
function refreshDocumentEnrichment() {
  state.documents =
    enrichDocuments(
      state.documents
    );

  renderDocuments();
  renderStatistics();
  populateDocumentFilters();

  if (state.isAdmin) {
    renderAdminDocuments();
  }
}

/* ==========================================================
   17. FILTRAGE DES DOCUMENTS
   ========================================================== */

function getFilteredDocuments() {
  const search =
    getElement("documentSearch")
      ?.value
      .trim()
      .toLowerCase() || "";

  const organizationId =
    getElement(
      "filterOrganization"
    )?.value || "";

  const alertCode =
    getElement("filterAlert")
      ?.value || "";

  const commune =
    getElement("filterCommune")
      ?.value || "";

  return state.documents.filter(
    (documentItem) => {
      /*
       * Protection supplémentaire :
       * les visiteurs ne doivent jamais voir
       * les documents non publiés.
       */
      if (
        !state.isAdmin &&
        documentItem
          .publication_status !==
          "published"
      ) {
        return false;
      }

      const searchableText = [
        documentItem.file_name,
        documentItem.organization_name,
        documentItem.alert_code,
        documentItem.region,
        documentItem.commune,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !search ||
        searchableText.includes(
          search
        );

      const matchesOrganization =
        !organizationId ||
        documentItem
          .organization_id ===
          organizationId;

      const matchesAlert =
        !alertCode ||
        documentItem
          .alert_code ===
          alertCode;

      const matchesCommune =
        !commune ||
        documentItem.commune ===
          commune;

      return (
        matchesSearch &&
        matchesOrganization &&
        matchesAlert &&
        matchesCommune
      );
    }
  );
}

/* ==========================================================
   18. AFFICHAGE DES DOCUMENTS PUBLICS
   ========================================================== */

function renderDocuments() {
  const container =
    getElement("documentsList");

  if (!container) {
    return;
  }

  /*
   * La liste publique affiche uniquement
   * les documents effectivement publiés.
   */
  const documents =
    getFilteredDocuments().filter(
      (item) =>
        item.publication_status ===
        "published"
    );

  updateDocumentsResultTitle(
    documents.length
  );

  if (documents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucun document trouvé
        </h3>

        <p>
          Modifiez les critères de recherche ou publiez une nouvelle fiche.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    documents
      .map(
        (documentItem) =>
          createDocumentCard(
            documentItem
          )
      )
      .join("");
}

/**
 * Met à jour le nombre de résultats.
 */
function updateDocumentsResultTitle(
  documentCount
) {
  const resultTitle =
    getElement(
      "documentsResultTitle"
    );

  if (!resultTitle) {
    return;
  }

  resultTitle.textContent =
    `${documentCount} document${
      documentCount > 1
        ? "s"
        : ""
    }`;
}

/**
 * Génère le HTML d’une fiche documentaire.
 */
function createDocumentCard(
  documentItem
) {
  const publicUrl =
    getPublicUrl(
      documentItem.storage_path
    );

  const organizationName =
    documentItem.organization_name ||
    "Organisation non renseignée";

  const alertCode =
    documentItem.alert_code ||
    "Alerte non renseignée";

  const region =
    documentItem.region ||
    "Non renseignée";

  const commune =
    documentItem.commune ||
    "Non renseignée";

  const fileName =
    documentItem.file_name ||
    "Document PDF";

  const downloadButton =
    publicUrl
      ? `
        <a
          class="button button-primary button-full"
          href="${escapeHtml(publicUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          Télécharger
        </a>
      `
      : `
        <button
          type="button"
          class="button button-secondary button-full"
          disabled
        >
          Fichier indisponible
        </button>
      `;

  return `
    <article class="document-card">
      <div class="document-card-header">
        <span class="document-type">
          PDF
        </span>

        <span class="commune-badge">
          ${escapeHtml(commune)}
        </span>
      </div>

      <h3>
        ${escapeHtml(fileName)}
      </h3>

      <dl class="document-metadata">
        <div>
          <dt>
            Organisation
          </dt>

          <dd>
            ${escapeHtml(
              organizationName
            )}
          </dd>
        </div>

        <div>
          <dt>
            Alerte ID
          </dt>

          <dd>
            ${escapeHtml(
              alertCode
            )}
          </dd>
        </div>

        <div>
          <dt>
            Région
          </dt>

          <dd>
            ${escapeHtml(
              region
            )}
          </dd>
        </div>

        <div>
          <dt>
            Commune
          </dt>

          <dd>
            ${escapeHtml(
              commune
            )}
          </dd>
        </div>
      </dl>

      <div class="document-card-footer">
        <span>
          ${formatFileSize(
            documentItem.file_size
          )}
        </span>

        <span>
          ${formatDate(
            documentItem.created_at
          )}
        </span>
      </div>

      ${downloadButton}
    </article>
  `;
}

/* ==========================================================
   19. STATISTIQUES PUBLIQUES
   ========================================================== */

function renderStatistics() {
  const publishedDocuments =
    state.documents.filter(
      (item) =>
        item.publication_status ===
        "published"
    );

  const organizations =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item.organization_id
        )
        .filter(Boolean)
    );

  const alerts =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item.alert_id ||
            item.alert_code
        )
        .filter(Boolean)
    );

  const communes =
    new Set(
      publishedDocuments
        .map(
          (item) =>
            item.alert_commune_id ||
            item.commune
        )
        .filter(Boolean)
    );

  const documentsCount =
    getElement("documentsCount");

  const organizationsCount =
    getElement(
      "organizationsCount"
    );

  const alertsCount =
    getElement("alertsCount");

  const communesCount =
    getElement("communesCount");

  if (documentsCount) {
    documentsCount.textContent =
      publishedDocuments.length;
  }

  if (organizationsCount) {
    organizationsCount.textContent =
      organizations.size;
  }

  if (alertsCount) {
    alertsCount.textContent =
      alerts.size;
  }

  if (communesCount) {
    communesCount.textContent =
      communes.size;
  }
}

/* ==========================================================
   20. LISTES DES FILTRES DOCUMENTAIRES
   ========================================================== */

function populateDocumentFilters() {
  populateUniqueSelect(
    "filterCommune",
    state.documents.map(
      (item) =>
        item.commune
    ),
    "Toutes les communes"
  );
}

/**
 * Remplit une liste déroulante avec des valeurs uniques.
 */
function populateUniqueSelect(
  selectId,
  values,
  defaultLabel
) {
  const select =
    getElement(selectId);

  if (!select) {
    return;
  }

  const currentValue =
    select.value;

  const valuesList =
    uniqueValues(values);

  select.innerHTML = `
    <option value="">
      ${escapeHtml(defaultLabel)}
    </option>
  `;

  valuesList.forEach(
    (value) => {
      const option =
        document.createElement(
          "option"
        );

      option.value = value;
      option.textContent =
        value;

      select.appendChild(
        option
      );
    }
  );

  if (
    valuesList.includes(
      currentValue
    )
  ) {
    select.value =
      currentValue;
  }
}

/* ==========================================================
   21. REINITIALISATION DES FILTRES
   ========================================================== */

function resetDocumentFilters() {
  const filterIds = [
    "documentSearch",
    "filterOrganization",
    "filterAlert",
    "filterCommune",
  ];

  filterIds.forEach(
    (id) => {
      const element =
        getElement(id);

      if (element) {
        element.value = "";
      }
    }
  );

  renderDocuments();
}
/* ==========================================================
   22. CHARGEMENT DES DONNEES D'ADMINISTRATION
   ========================================================== */

async function loadAdminData() {
  if (!state.isAdmin) {
    return;
  }

  try {
    await Promise.all([
      loadAdminOrganizations(),
      loadAdminAlerts(),
    ]);

    renderAdminDocuments();
  } catch (error) {
    console.error(
      "Erreur de chargement des données administratives :",
      error
    );

    const messageElement =
      getElement("adminGlobalMessage");

    showMessage(
      messageElement,
      error.message ||
        "Impossible de charger les données administratives.",
      "error"
    );
  }
}

/* ==========================================================
   23. ADMINISTRATION DES ORGANISATIONS
   ========================================================== */

async function loadAdminOrganizations() {
  const {
    data,
    error,
  } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      acronym,
      slug,
      is_active,
      created_at,
      updated_at
    `)
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les organisations : ${error.message}`
    );
  }

  state.adminOrganizations =
    data || [];

  renderAdminOrganizations();
}

/**
 * Affiche la liste des organisations dans le tableau
 * d’administration.
 */
function renderAdminOrganizations() {
  const tableBody =
    getElement(
      "adminOrganizationsTable"
    );

  if (!tableBody) {
    return;
  }

  if (
    state.adminOrganizations.length ===
    0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Aucune organisation enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.adminOrganizations
      .map(
        (organization) => `
          <tr>
            <td>
              ${escapeHtml(
                organization.name
              )}
            </td>

            <td>
              ${escapeHtml(
                organization.acronym ||
                  "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                organization.slug ||
                  "—"
              )}
            </td>

            <td>
              <span class="status-badge ${
                organization.is_active
                  ? "status-active"
                  : "status-inactive"
              }">
                ${
                  organization.is_active
                    ? "Active"
                    : "Inactive"
                }
              </span>
            </td>

            <td>
              <div class="table-actions">
                <button
                  type="button"
                  class="button button-small button-secondary"
                  data-action="edit-organization"
                  data-id="${escapeHtml(
                    organization.id
                  )}"
                >
                  Modifier
                </button>

                <button
                  type="button"
                  class="button button-small ${
                    organization.is_active
                      ? "button-danger"
                      : "button-success"
                  }"
                  data-action="toggle-organization"
                  data-id="${escapeHtml(
                    organization.id
                  )}"
                >
                  ${
                    organization.is_active
                      ? "Désactiver"
                      : "Activer"
                  }
                </button>
              </div>
            </td>
          </tr>
        `
      )
      .join("");
}

/**
 * Réinitialise le formulaire d’organisation.
 */
function resetOrganizationForm() {
  const form =
    getElement("organizationForm");

  form?.reset();

  const databaseId =
    getElement(
      "organizationDatabaseId"
    );

  if (databaseId) {
    databaseId.value = "";
  }

  const activeCheckbox =
    getElement("organizationActive");

  if (activeCheckbox) {
    activeCheckbox.checked = true;
  }

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’organisation";
  }

  hideMessage(
    getElement(
      "organizationMessage"
    )
  );
}

/**
 * Charge une organisation dans le formulaire.
 */
function editOrganization(
  organizationId
) {
  const organization =
    state.adminOrganizations.find(
      (item) =>
        item.id === organizationId
    );

  if (!organization) {
    window.alert(
      "Organisation introuvable."
    );

    return;
  }

  const databaseId =
    getElement(
      "organizationDatabaseId"
    );

  const nameInput =
    getElement("organizationName");

  const acronymInput =
    getElement(
      "organizationAcronym"
    );

  const activeCheckbox =
    getElement("organizationActive");

  if (databaseId) {
    databaseId.value =
      organization.id;
  }

  if (nameInput) {
    nameInput.value =
      organization.name || "";
  }

  if (acronymInput) {
    acronymInput.value =
      organization.acronym || "";
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      Boolean(
        organization.is_active
      );
  }

  const submitButton =
    getElement(
      "organizationSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’organisation";
  }

  getElement("organizationName")
    ?.focus();
}

/**
 * Enregistre une nouvelle organisation
 * ou met à jour une organisation existante.
 */
async function handleOrganizationSubmit(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
    getElement(
      "organizationSubmitButton"
    );

  const messageElement =
    getElement(
      "organizationMessage"
    );

  hideMessage(messageElement);

  const organizationId =
    getElement(
      "organizationDatabaseId"
    )?.value || "";

  const name =
    getElement("organizationName")
      ?.value
      .trim() || "";

  const acronym =
    getElement(
      "organizationAcronym"
    )?.value
      .trim() || "";

  const isActive =
    getElement(
      "organizationActive"
    )?.checked ?? true;

  if (!name) {
    showMessage(
      messageElement,
      "Le nom de l’organisation est obligatoire.",
      "error"
    );

    return;
  }

  const payload = {
    name,
    acronym:
      acronym || null,
    slug:
      slugify(
        acronym || name
      ),
    is_active:
      isActive,
    updated_at:
      new Date().toISOString(),
  };

  setButtonLoading(
    submitButton,
    true,
    organizationId
      ? "Mise à jour..."
      : "Enregistrement..."
  );

  try {
    if (organizationId) {
      const {
        error,
      } = await supabase
        .from("organizations")
        .update(payload)
        .eq(
          "id",
          organizationId
        );

      if (error) {
        throw error;
      }

      showMessage(
        messageElement,
        "Organisation mise à jour avec succès.",
        "success"
      );
    } else {
      const {
        error,
      } = await supabase
        .from("organizations")
        .insert({
          ...payload,
          created_at:
            new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      showMessage(
        messageElement,
        "Organisation créée avec succès.",
        "success"
      );
    }

    resetOrganizationForm();

    await Promise.all([
      loadAdminOrganizations(),
      loadPublicOrganizations(),
    ]);

    renderDocuments();
  } catch (error) {
    showMessage(
      messageElement,
      error.message ||
        "Impossible d’enregistrer l’organisation.",
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/**
 * Active ou désactive une organisation.
 */
async function toggleOrganizationStatus(
  organizationId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const organization =
    state.adminOrganizations.find(
      (item) =>
        item.id === organizationId
    );

  if (!organization) {
    return;
  }

  const newStatus =
    !organization.is_active;

  const confirmation =
    window.confirm(
      newStatus
        ? `Activer l’organisation « ${organization.name} » ?`
        : `Désactiver l’organisation « ${organization.name} » ?`
    );

  if (!confirmation) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("organizations")
    .update({
      is_active:
        newStatus,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      organizationId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut : ${error.message}`
    );

    return;
  }

  await Promise.all([
    loadAdminOrganizations(),
    loadPublicOrganizations(),
  ]);
}

/* ==========================================================
   24. ADMINISTRATION DES ALERTES
   ========================================================== */

/**
 * Charge toutes les alertes et toutes leurs communes,
 * y compris les alertes inactives.
 */
async function loadAdminAlerts() {
const {
  data: communesData,
  error: communesError,
} = await supabase
  .from("alert_communes")
  .select(`
    id,
    alert_id,
    commune
  `)
  .order("commune", {
    ascending: true,
  });

  if (alertsError) {
    throw new Error(
      `Impossible de charger les alertes : ${alertsError.message}`
    );
  }

  const {
    data: communesData,
    error: communesError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      alert_id,
      commune,
      is_active,
      created_at,
      updated_at
    `)
    .order("commune", {
      ascending: true,
    });

  if (communesError) {
    throw new Error(
      `Impossible de charger les communes : ${communesError.message}`
    );
  }

  const communesByAlert =
    new Map();

  (communesData || []).forEach(
    (communeItem) => {
      if (
        !communesByAlert.has(
          communeItem.alert_id
        )
      ) {
        communesByAlert.set(
          communeItem.alert_id,
          []
        );
      }

      communesByAlert
        .get(
          communeItem.alert_id
        )
        .push(
          communeItem
        );
    }
  );

  state.adminAlerts =
    (alertsData || []).map(
      (alertItem) => ({
        ...alertItem,
        communes:
          communesByAlert.get(
            alertItem.id
          ) || [],
      })
    );

  renderAdminAlerts();
}

/**
 * Affiche les alertes et leurs communes.
 */
function renderAdminAlerts() {
  const tableBody =
    getElement(
      "adminAlertsTable"
    );

  if (!tableBody) {
    return;
  }

  if (
    state.adminAlerts.length ===
    0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">
          Aucune alerte enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.adminAlerts
      .map(
        (alertItem) => {
          const activeCommunes =
            alertItem.communes.filter(
              (item) =>
                item.is_active
            );

          const communesText =
            activeCommunes.length > 0
              ? activeCommunes
                  .map(
                    (item) =>
                      item.commune
                  )
                  .join(", ")
              : "Aucune commune active";

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    alertItem.alert_code
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  alertItem.region ||
                    "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  communesText
                )}
              </td>

              <td>
                <span class="status-badge ${
                  alertItem.is_active
                    ? "status-active"
                    : "status-inactive"
                }">
                  ${
                    alertItem.is_active
                      ? "Active"
                      : "Inactive"
                  }
                </span>
              </td>

              <td>
                <div class="table-actions">
                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="edit-alert"
                    data-id="${escapeHtml(
                      alertItem.id
                    )}"
                  >
                    Modifier
                  </button>

                  <button
                    type="button"
                    class="button button-small ${
                      alertItem.is_active
                        ? "button-danger"
                        : "button-success"
                    }"
                    data-action="toggle-alert"
                    data-id="${escapeHtml(
                      alertItem.id
                    )}"
                  >
                    ${
                      alertItem.is_active
                        ? "Désactiver"
                        : "Activer"
                    }
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      )
      .join("");
}

/**
 * Convertit le contenu du champ Commune(s)
 * en tableau propre et sans doublon.
 *
 * Séparateurs acceptés :
 * - virgule
 * - point-virgule
 * - retour à la ligne
 */
function parseCommuneList(value) {
  const communes =
    String(value || "")
      .split(/[,\n;]+/)
      .map((item) =>
        item.trim()
      )
      .filter(Boolean);

  const normalizedMap =
    new Map();

  communes.forEach(
    (commune) => {
      const key =
        commune
          .normalize("NFD")
          .replace(
            /[\u0300-\u036f]/g,
            ""
          )
          .toLowerCase();

      if (
        !normalizedMap.has(key)
      ) {
        normalizedMap.set(
          key,
          commune
        );
      }
    }
  );

  return [
    ...normalizedMap.values(),
  ].sort((a, b) =>
    a.localeCompare(
      b,
      "fr",
      {
        sensitivity: "base",
      }
    )
  );
}

/**
 * Réinitialise le formulaire d’alerte.
 */
function resetAlertForm() {
  const form =
    getElement("alertForm");

  form?.reset();

  const alertDatabaseId =
    getElement(
      "alertDatabaseId"
    );

  const communeDatabaseId =
    getElement(
      "alertCommuneDatabaseId"
    );

  if (alertDatabaseId) {
    alertDatabaseId.value = "";
  }

  if (communeDatabaseId) {
    communeDatabaseId.value = "";
  }

  const activeCheckbox =
    getElement("alertActive");

  if (activeCheckbox) {
    activeCheckbox.checked = true;
  }

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Enregistrer l’alerte";
  }

  hideMessage(
    getElement("alertMessage")
  );
}

/**
 * Charge une alerte dans le formulaire.
 */
function editAlert(alertId) {
  const alertItem =
    state.adminAlerts.find(
      (item) =>
        item.id === alertId
    );

  if (!alertItem) {
    window.alert(
      "Alerte introuvable."
    );

    return;
  }

  const activeCommunes =
    alertItem.communes
      .filter(
        (item) =>
          item.is_active
      )
      .map(
        (item) =>
          item.commune
      );

  const alertDatabaseId =
    getElement(
      "alertDatabaseId"
    );

  const codeInput =
    getElement("alertCode");

  const regionInput =
    getElement("alertRegion");

  const communeInput =
    getElement("alertCommune");

  const activeCheckbox =
    getElement("alertActive");

  if (alertDatabaseId) {
    alertDatabaseId.value =
      alertItem.id;
  }

  if (codeInput) {
    codeInput.value =
      alertItem.alert_code || "";
  }

  if (regionInput) {
    regionInput.value =
      alertItem.region || "";
  }

  if (communeInput) {
    communeInput.value =
      activeCommunes.join(
        "\n"
      );
  }

  if (activeCheckbox) {
    activeCheckbox.checked =
      Boolean(
        alertItem.is_active
      );
  }

  const submitButton =
    getElement(
      "alertSubmitButton"
    );

  if (submitButton) {
    submitButton.textContent =
      "Mettre à jour l’alerte";
  }

  getElement("alertCode")
    ?.focus();
}

/* ==========================================================
   25. ENREGISTREMENT D'UNE ALERTE ET DE SES COMMUNES
   ========================================================== */

async function handleAlertSubmit(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
    getElement(
      "alertSubmitButton"
    );

  const messageElement =
    getElement("alertMessage");

  hideMessage(messageElement);

  const alertId =
    getElement(
      "alertDatabaseId"
    )?.value || "";

  const alertCode =
    getElement("alertCode")
      ?.value
      .trim() || "";

  const region =
    getElement("alertRegion")
      ?.value
      .trim() || "";

  const communeText =
    getElement("alertCommune")
      ?.value || "";

  const isActive =
    getElement("alertActive")
      ?.checked ?? true;

  const communes =
    parseCommuneList(
      communeText
    );

  if (!alertCode) {
    showMessage(
      messageElement,
      "L’Alerte ID est obligatoire.",
      "error"
    );

    return;
  }

  if (!region) {
    showMessage(
      messageElement,
      "La région est obligatoire.",
      "error"
    );

    return;
  }

  if (communes.length === 0) {
    showMessage(
      messageElement,
      "Veuillez renseigner au moins une commune.",
      "error"
    );

    return;
  }

  setButtonLoading(
    submitButton,
    true,
    alertId
      ? "Mise à jour..."
      : "Enregistrement..."
  );

  try {
    let savedAlertId =
      alertId;

    const alertPayload = {
      alert_code:
        alertCode,
      region,
      is_active:
        isActive,
      updated_at:
        new Date().toISOString(),
    };

    if (alertId) {
      const {
        error,
      } = await supabase
        .from("alerts")
        .update(
          alertPayload
        )
        .eq(
          "id",
          alertId
        );

      if (error) {
        throw error;
      }
    } else {
      const {
        data,
        error,
      } = await supabase
        .from("alerts")
        .insert({
          ...alertPayload,
          created_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      savedAlertId =
        data.id;
    }

    await synchronizeAlertCommunes(
      savedAlertId,
      communes
    );

    showMessage(
      messageElement,
      alertId
        ? "Alerte mise à jour avec succès."
        : "Alerte créée avec succès.",
      "success"
    );

    resetAlertForm();

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

    refreshDocumentEnrichment();
  } catch (error) {
    showMessage(
      messageElement,
      error.message ||
        "Impossible d’enregistrer l’alerte.",
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/**
 * Synchronise les communes d’une alerte.
 *
 * Comportement :
 * - les communes saisies sont créées ou réactivées ;
 * - les anciennes communes retirées du formulaire
 *   sont désactivées ;
 * - les enregistrements ne sont pas supprimés afin de
 *   préserver l’intégrité des documents déjà publiés.
 */
async function synchronizeAlertCommunes(
  alertId,
  communes
) {
  const {
    data: existingCommunes,
    error: loadError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      alert_id,
      commune,
      is_active
    `)
    .eq(
      "alert_id",
      alertId
    );

  if (loadError) {
    throw new Error(
      `Impossible de lire les communes existantes : ${loadError.message}`
    );
  }

  const normalizedRequested =
    new Map();

  communes.forEach(
    (commune) => {
      const key =
        normalizeCommuneKey(
          commune
        );

      normalizedRequested.set(
        key,
        commune
      );
    }
  );

  const existingByKey =
    new Map();

  (existingCommunes || []).forEach(
    (communeItem) => {
      existingByKey.set(
        normalizeCommuneKey(
          communeItem.commune
        ),
        communeItem
      );
    }
  );

  const rowsToInsert = [];
  const rowsToActivate = [];
  const rowsToDeactivate = [];

  normalizedRequested.forEach(
    (commune, key) => {
      const existing =
        existingByKey.get(key);

      if (!existing) {
        rowsToInsert.push({
          alert_id:
            alertId,
          commune,
          is_active:
            true,
          created_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        });

        return;
      }

      if (
        !existing.is_active ||
        existing.commune !== commune
      ) {
        rowsToActivate.push({
          id:
            existing.id,
          commune,
        });
      }
    }
  );

  existingByKey.forEach(
    (existing, key) => {
      if (
        !normalizedRequested.has(
          key
        ) &&
        existing.is_active
      ) {
        rowsToDeactivate.push(
          existing.id
        );
      }
    }
  );

  if (rowsToInsert.length > 0) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .insert(
        rowsToInsert
      );

    if (error) {
      throw new Error(
        `Impossible d’ajouter les communes : ${error.message}`
      );
    }
  }

  for (
    const row
    of rowsToActivate
  ) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .update({
        commune:
          row.commune,
        is_active:
          true,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        row.id
      );

    if (error) {
      throw new Error(
        `Impossible de réactiver la commune « ${row.commune} » : ${error.message}`
      );
    }
  }

  if (
    rowsToDeactivate.length > 0
  ) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .update({
        is_active:
          false,
        updated_at:
          new Date().toISOString(),
      })
      .in(
        "id",
        rowsToDeactivate
      );

    if (error) {
      throw new Error(
        `Impossible de désactiver les anciennes communes : ${error.message}`
      );
    }
  }
}

function normalizeCommuneKey(
  value
) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/* ==========================================================
   26. ACTIVATION ET DESACTIVATION DES ALERTES
   ========================================================== */

async function toggleAlertStatus(
  alertId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const alertItem =
    state.adminAlerts.find(
      (item) =>
        item.id === alertId
    );

  if (!alertItem) {
    return;
  }

  const newStatus =
    !alertItem.is_active;

  const confirmation =
    window.confirm(
      newStatus
        ? `Activer l’alerte « ${alertItem.alert_code} » ?`
        : `Désactiver l’alerte « ${alertItem.alert_code} » ?`
    );

  if (!confirmation) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("alerts")
    .update({
      is_active:
        newStatus,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      alertId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut de l’alerte : ${error.message}`
    );

    return;
  }

  await Promise.all([
    loadAdminAlerts(),
    loadPublicAlerts(),
    loadPublicAlertCommuneOptions(),
  ]);

  refreshDocumentEnrichment();
}

/* ==========================================================
   27. GESTION DES ACTIONS DES TABLEAUX ADMIN
   ========================================================== */

function handleAdminOrganizationTableClick(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const organizationId =
    button.dataset.id;

  switch (
    button.dataset.action
  ) {
    case "edit-organization":
      editOrganization(
        organizationId
      );
      break;

    case "toggle-organization":
      toggleOrganizationStatus(
        organizationId
      );
      break;

    default:
      break;
  }
}

function handleAdminAlertTableClick(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const alertId =
    button.dataset.id;

  switch (
    button.dataset.action
  ) {
    case "edit-alert":
      editAlert(
        alertId
      );
      break;

    case "toggle-alert":
      toggleAlertStatus(
        alertId
      );
      break;

    default:
      break;
  }
}
/* ==========================================================
   28. OUTILS DE LECTURE CSV
   ========================================================== */

/**
 * Détecte automatiquement le séparateur principal du fichier CSV.
 *
 * Séparateurs pris en charge :
 * - virgule
 * - point-virgule
 * - tabulation
 */
function detectCsvDelimiter(text) {
  const firstNonEmptyLine =
    String(text || "")
      .split(/\r?\n/)
      .find((line) =>
        line.trim()
      ) || "";

  const candidates = [
    {
      delimiter: ",",
      count:
        (firstNonEmptyLine.match(/,/g) || [])
          .length,
    },
    {
      delimiter: ";",
      count:
        (firstNonEmptyLine.match(/;/g) || [])
          .length,
    },
    {
      delimiter: "\t",
      count:
        (firstNonEmptyLine.match(/\t/g) || [])
          .length,
    },
  ];

  candidates.sort(
    (a, b) =>
      b.count - a.count
  );

  return candidates[0].count > 0
    ? candidates[0].delimiter
    : ",";
}

/**
 * Analyse une ligne CSV en respectant :
 * - les guillemets doubles ;
 * - les séparateurs contenus dans les guillemets ;
 * - les guillemets échappés.
 */
function parseCsvLine(
  line,
  delimiter
) {
  const values = [];
  let currentValue = "";
  let insideQuotes = false;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const character =
      line[index];

    const nextCharacter =
      line[index + 1];

    if (character === '"') {
      if (
        insideQuotes &&
        nextCharacter === '"'
      ) {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes =
          !insideQuotes;
      }

      continue;
    }

    if (
      character === delimiter &&
      !insideQuotes
    ) {
      values.push(
        currentValue.trim()
      );

      currentValue = "";
      continue;
    }

    currentValue +=
      character;
  }

  values.push(
    currentValue.trim()
  );

  return values;
}

/**
 * Transforme un contenu CSV en tableau d’objets.
 */
function parseCsvText(text) {
  const normalizedText =
    String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

  const lines =
    normalizedText
      .split("\n")
      .filter((line) =>
        line.trim()
      );

  if (lines.length < 2) {
    throw new Error(
      "Le fichier CSV ne contient aucune donnée exploitable."
    );
  }

  const delimiter =
    detectCsvDelimiter(
      normalizedText
    );

  const rawHeaders =
    parseCsvLine(
      lines[0],
      delimiter
    );

  const normalizedHeaders =
    rawHeaders.map(
      normalizeHeader
    );

  const rows = [];

  for (
    let index = 1;
    index < lines.length;
    index += 1
  ) {
    const values =
      parseCsvLine(
        lines[index],
        delimiter
      );

    const row = {};

    normalizedHeaders.forEach(
      (header, headerIndex) => {
        row[header] =
          values[headerIndex]
            ?.trim() || "";
      }
    );

    row.__lineNumber =
      index + 1;

    rows.push(row);
  }

  return {
    rows,
    headers:
      normalizedHeaders,
    delimiter,
  };
}

/* ==========================================================
   29. NORMALISATION DES COLONNES CSV
   ========================================================== */

/**
 * Récupère la première valeur disponible
 * parmi plusieurs variantes de nom de colonne.
 */
function getCsvValue(
  row,
  aliases
) {
  for (
    const alias
    of aliases
  ) {
    const normalizedAlias =
      normalizeHeader(alias);

    if (
      Object.prototype.hasOwnProperty.call(
        row,
        normalizedAlias
      )
    ) {
      const value =
        String(
          row[normalizedAlias] ?? ""
        ).trim();

      if (value) {
        return value;
      }
    }
  }

  return "";
}

/**
 * Convertit une ligne CSV au format attendu
 * par l’application.
 */
function normalizeAlertCsvRow(
  row
) {
  const alertCode =
    getCsvValue(
      row,
      [
        "Alerte ID",
        "Alert ID",
        "Alerte",
        "alert_code",
        "alert_id",
      ]
    );

  const region =
    getCsvValue(
      row,
      [
        "Région",
        "Region",
        "region",
      ]
    );

  const communeValue =
    getCsvValue(
      row,
      [
        "Communes",
        "Commune",
        "communes",
        "commune",
      ]
    );

  return {
    alertCode,
    region,
    communes:
      parseCommuneList(
        communeValue
      ),
    lineNumber:
      row.__lineNumber,
  };
}

/**
 * Vérifie la présence des colonnes obligatoires.
 */
function validateAlertCsvHeaders(
  headers
) {
  const normalizedHeaders =
    new Set(headers);

  const hasAlertCode =
    [
      "alerte_id",
      "alert_id",
      "alerte",
      "alert_code",
    ].some(
      (header) =>
        normalizedHeaders.has(
          header
        )
    );

  const hasRegion =
    normalizedHeaders.has(
      "region"
    );

  const hasCommune =
    normalizedHeaders.has(
      "communes"
    ) ||
    normalizedHeaders.has(
      "commune"
    );

  const missingColumns = [];

  if (!hasAlertCode) {
    missingColumns.push(
      "Alerte ID"
    );
  }

  if (!hasRegion) {
    missingColumns.push(
      "Région"
    );
  }

  if (!hasCommune) {
    missingColumns.push(
      "Communes"
    );
  }

  if (
    missingColumns.length > 0
  ) {
    throw new Error(
      `Colonnes CSV manquantes : ${missingColumns.join(", ")}.`
    );
  }
}

/* ==========================================================
   30. REGROUPEMENT DES LIGNES PAR ALERTE
   ========================================================== */

/**
 * Regroupe plusieurs lignes ayant le même Alert ID.
 *
 * Exemple :
 *
 * 777_260615_SANPIB,Koulsé,Pibaoré
 * 777_260615_SANPIB,Koulsé,Korsimoro
 * 777_260615_SANPIB,Koulsé,Ziga
 *
 * devient une seule alerte contenant trois communes.
 */
function groupAlertCsvRows(
  rows
) {
  const groupedAlerts =
    new Map();

  const validationErrors = [];

  rows.forEach(
    (rawRow) => {
      const row =
        normalizeAlertCsvRow(
          rawRow
        );

      if (
        !row.alertCode &&
        !row.region &&
        row.communes.length === 0
      ) {
        return;
      }

      if (!row.alertCode) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : Alerte ID manquante.`
        );

        return;
      }

      if (!row.region) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : région manquante pour l’alerte ${row.alertCode}.`
        );

        return;
      }

      if (
        row.communes.length === 0
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : commune manquante pour l’alerte ${row.alertCode}.`
        );

        return;
      }

      const alertKey =
        normalizeAlertCodeKey(
          row.alertCode
        );

      if (
        !groupedAlerts.has(
          alertKey
        )
      ) {
        groupedAlerts.set(
          alertKey,
          {
            alertCode:
              row.alertCode,
            region:
              row.region,
            communes:
              new Map(),
            sourceLines: [
              row.lineNumber,
            ],
          }
        );
      } else {
        groupedAlerts
          .get(alertKey)
          .sourceLines.push(
            row.lineNumber
          );
      }

      const groupedAlert =
        groupedAlerts.get(
          alertKey
        );

      if (
        normalizeRegionKey(
          groupedAlert.region
        ) !==
        normalizeRegionKey(
          row.region
        )
      ) {
        validationErrors.push(
          `Ligne ${row.lineNumber} : l’alerte ${row.alertCode} est associée à plusieurs régions (${groupedAlert.region} et ${row.region}).`
        );

        return;
      }

      row.communes.forEach(
        (commune) => {
          groupedAlert.communes.set(
            normalizeCommuneKey(
              commune
            ),
            commune
          );
        }
      );
    }
  );

  if (
    validationErrors.length > 0
  ) {
    throw new Error(
      validationErrors
        .slice(0, 15)
        .join("\n")
    );
  }

  return [
    ...groupedAlerts.values(),
  ].map(
    (item) => ({
      alertCode:
        item.alertCode,
      region:
        item.region,
      communes: [
        ...item.communes.values(),
      ].sort((a, b) =>
        a.localeCompare(
          b,
          "fr",
          {
            sensitivity:
              "base",
          }
        )
      ),
      sourceLines:
        item.sourceLines,
    })
  );
}

function normalizeAlertCodeKey(
  value
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeRegionKey(
  value
) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/* ==========================================================
   31. LECTURE DU FICHIER CSV
   ========================================================== */

async function readTextFile(
  file
) {
  if (!file) {
    throw new Error(
      "Veuillez sélectionner un fichier CSV."
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  if (
    extension !== "csv" &&
    file.type !==
      "text/csv" &&
    file.type !==
      "application/vnd.ms-excel"
  ) {
    throw new Error(
      "Le fichier sélectionné doit être au format CSV."
    );
  }

  return await file.text();
}

/* ==========================================================
   32. APERCU DU FICHIER CSV
   ========================================================== */

function renderAlertCsvPreview(
  groupedAlerts
) {
  const preview =
    getElement(
      "alertCsvPreview"
    );

  if (!preview) {
    return;
  }

  if (
    groupedAlerts.length === 0
  ) {
    preview.innerHTML = `
      <div class="empty-state">
        Aucune alerte valide détectée.
      </div>
    `;

    preview.classList.remove(
      "hidden"
    );

    return;
  }

  const totalCommunes =
    groupedAlerts.reduce(
      (
        total,
        alertItem
      ) =>
        total +
        alertItem.communes.length,
      0
    );

  preview.innerHTML = `
    <div class="csv-preview-summary">
      <strong>
        ${groupedAlerts.length}
        alerte${
          groupedAlerts.length > 1
            ? "s"
            : ""
        }
      </strong>

      <span>
        ${totalCommunes}
        commune${
          totalCommunes > 1
            ? "s"
            : ""
        }
      </span>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>
              Alerte ID
            </th>

            <th>
              Région
            </th>

            <th>
              Communes
            </th>
          </tr>
        </thead>

        <tbody>
          ${groupedAlerts
            .slice(0, 20)
            .map(
              (alertItem) => `
                <tr>
                  <td>
                    ${escapeHtml(
                      alertItem.alertCode
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      alertItem.region
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      alertItem.communes.join(
                        ", "
                      )
                    )}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      groupedAlerts.length > 20
        ? `
          <p class="csv-preview-note">
            Aperçu limité aux 20 premières alertes.
          </p>
        `
        : ""
    }
  `;

  preview.classList.remove(
    "hidden"
  );
}

/* ==========================================================
   33. IMPORT CSV DES ALERTES
   ========================================================== */

async function handleAlertCsvImport(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const submitButton =
    event.submitter ||
    getElement(
      "alertCsvImportButton"
    );

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  const fileInput =
    getElement(
      "alertCsvFile"
    );

  const file =
    fileInput
      ?.files?.[0];

  hideMessage(
    messageElement
  );

  setButtonLoading(
    submitButton,
    true,
    "Importation..."
  );

  try {
    const csvText =
      await readTextFile(
        file
      );

    const {
      rows,
      headers,
    } =
      parseCsvText(
        csvText
      );

    validateAlertCsvHeaders(
      headers
    );

    const groupedAlerts =
      groupAlertCsvRows(
        rows
      );

    if (
      groupedAlerts.length === 0
    ) {
      throw new Error(
        "Aucune alerte valide n’a été trouvée dans le fichier."
      );
    }

    renderAlertCsvPreview(
      groupedAlerts
    );

    const result =
      await importGroupedAlerts(
        groupedAlerts
      );

    showMessage(
      messageElement,
      [
        "Import terminé.",
        `${result.createdAlerts} alerte(s) créée(s).`,
        `${result.updatedAlerts} alerte(s) mise(s) à jour.`,
        `${result.createdCommunes} commune(s) créée(s).`,
        `${result.reactivatedCommunes} commune(s) réactivée(s).`,
        `${result.unchangedCommunes} commune(s) déjà présente(s).`,
      ].join(" "),
      "success"
    );

    if (fileInput) {
      fileInput.value = "";
    }

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

    refreshDocumentEnrichment();
  } catch (error) {
    showMessage(
      messageElement,
      error.message ||
        "Impossible d’importer le fichier CSV.",
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   34. IMPORT EN BASE DE DONNEES
   ========================================================== */

async function importGroupedAlerts(
  groupedAlerts
) {
  const result = {
    createdAlerts: 0,
    updatedAlerts: 0,
    createdCommunes: 0,
    reactivatedCommunes: 0,
    unchangedCommunes: 0,
  };

  const alertCodes =
    groupedAlerts.map(
      (item) =>
        item.alertCode
    );

  const {
    data: existingAlerts,
    error: existingAlertsError,
  } = await supabase
    .from("alerts")
    .select(`
      id,
      alert_code,
      region,
      is_active
    `)
    .in(
      "alert_code",
      alertCodes
    );

  if (existingAlertsError) {
    throw new Error(
      `Impossible de vérifier les alertes existantes : ${existingAlertsError.message}`
    );
  }

  const existingAlertsByCode =
    new Map(
      (existingAlerts || []).map(
        (item) => [
          normalizeAlertCodeKey(
            item.alert_code
          ),
          item,
        ]
      )
    );

  for (
    const groupedAlert
    of groupedAlerts
  ) {
    const alertKey =
      normalizeAlertCodeKey(
        groupedAlert.alertCode
      );

    let existingAlert =
      existingAlertsByCode.get(
        alertKey
      );

    let alertId;

    if (!existingAlert) {
      const {
        data,
        error,
      } = await supabase
        .from("alerts")
        .insert({
          alert_code:
            groupedAlert.alertCode,
          region:
            groupedAlert.region,
          is_active:
            true,
          created_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .select(`
          id,
          alert_code,
          region,
          is_active
        `)
        .single();

      if (error) {
        throw new Error(
          `Impossible de créer l’alerte ${groupedAlert.alertCode} : ${error.message}`
        );
      }

      existingAlert = data;
      alertId =
        data.id;

      existingAlertsByCode.set(
        alertKey,
        data
      );

      result.createdAlerts +=
        1;
    } else {
      alertId =
        existingAlert.id;

      const regionChanged =
        normalizeRegionKey(
          existingAlert.region
        ) !==
        normalizeRegionKey(
          groupedAlert.region
        );

      const statusChanged =
        !existingAlert.is_active;

      if (
        regionChanged ||
        statusChanged
      ) {
        const {
          error,
        } = await supabase
          .from("alerts")
          .update({
            region:
              groupedAlert.region,
            is_active:
              true,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            alertId
          );

        if (error) {
          throw new Error(
            `Impossible de mettre à jour l’alerte ${groupedAlert.alertCode} : ${error.message}`
          );
        }

        result.updatedAlerts +=
          1;
      }
    }

    const communeResult =
      await importAlertCommunes(
        alertId,
        groupedAlert.communes
      );

    result.createdCommunes +=
      communeResult.created;

    result.reactivatedCommunes +=
      communeResult.reactivated;

    result.unchangedCommunes +=
      communeResult.unchanged;
  }

  return result;
}

/* ==========================================================
   35. IMPORT DES COMMUNES D'UNE ALERTE
   ========================================================== */

/**
 * Ajoute les communes du CSV sans désactiver
 * celles qui existent déjà mais ne figurent pas dans le fichier.
 *
 * Cette logique est volontairement différente
 * de synchronizeAlertCommunes().
 *
 * - Le formulaire manuel synchronise toute la liste.
 * - L’import CSV ajoute ou réactive les données présentes.
 */
async function importAlertCommunes(
  alertId,
  communes
) {
  const result = {
    created: 0,
    reactivated: 0,
    unchanged: 0,
  };

  const {
    data: existingCommunes,
    error: loadError,
  } = await supabase
    .from("alert_communes")
    .select(`
      id,
      commune,
      is_active
    `)
    .eq(
      "alert_id",
      alertId
    );

  if (loadError) {
    throw new Error(
      `Impossible de vérifier les communes existantes : ${loadError.message}`
    );
  }

  const existingByKey =
    new Map(
      (existingCommunes || []).map(
        (item) => [
          normalizeCommuneKey(
            item.commune
          ),
          item,
        ]
      )
    );

  const rowsToInsert = [];

  for (
    const commune
    of communes
  ) {
    const communeKey =
      normalizeCommuneKey(
        commune
      );

    const existing =
      existingByKey.get(
        communeKey
      );

    if (!existing) {
      rowsToInsert.push({
        alert_id:
          alertId,
        commune,
        is_active:
          true,
        created_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      });

      continue;
    }

    if (!existing.is_active) {
      const {
        error,
      } = await supabase
        .from("alert_communes")
        .update({
          commune,
          is_active:
            true,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          existing.id
        );

      if (error) {
        throw new Error(
          `Impossible de réactiver la commune ${commune} : ${error.message}`
        );
      }

      result.reactivated +=
        1;
    } else {
      result.unchanged +=
        1;
    }
  }

  if (
    rowsToInsert.length > 0
  ) {
    const {
      error,
    } = await supabase
      .from("alert_communes")
      .insert(
        rowsToInsert
      );

    if (error) {
      throw new Error(
        `Impossible d’ajouter les communes : ${error.message}`
      );
    }

    result.created +=
      rowsToInsert.length;
  }

  return result;
}

/* ==========================================================
   36. PREVISUALISATION AVANT IMPORT
   ========================================================== */

async function handleAlertCsvPreview() {
  const fileInput =
    getElement(
      "alertCsvFile"
    );

  const file =
    fileInput
      ?.files?.[0];

  const messageElement =
    getElement(
      "alertCsvMessage"
    );

  hideMessage(
    messageElement
  );

  try {
    const csvText =
      await readTextFile(
        file
      );

    const {
      rows,
      headers,
    } =
      parseCsvText(
        csvText
      );

    validateAlertCsvHeaders(
      headers
    );

    const groupedAlerts =
      groupAlertCsvRows(
        rows
      );

    renderAlertCsvPreview(
      groupedAlerts
    );

    showMessage(
      messageElement,
      "Le fichier CSV est valide et prêt à être importé.",
      "success"
    );
  } catch (error) {
    const preview =
      getElement(
        "alertCsvPreview"
      );

    preview?.classList.add(
      "hidden"
    );

    if (preview) {
      preview.innerHTML = "";
    }

    showMessage(
      messageElement,
      error.message ||
        "Le fichier CSV est invalide.",
      "error"
    );
  }
}

/* ==========================================================
   37. REINITIALISATION DE L'IMPORT CSV
   ========================================================== */

function resetAlertCsvImport() {
  const form =
    getElement(
      "alertCsvForm"
    );

  form?.reset();

  const preview =
    getElement(
      "alertCsvPreview"
    );

  if (preview) {
    preview.innerHTML = "";
    preview.classList.add(
      "hidden"
    );
  }

  hideMessage(
    getElement(
      "alertCsvMessage"
    )
  );
}
/* ==========================================================
   38. AFFICHAGE ADMINISTRATIF DES DOCUMENTS
   ========================================================== */

function renderAdminDocuments() {
  const tableBody =
    getElement("adminDocumentsTable");

  if (!tableBody) {
    return;
  }

  if (!state.isAdmin) {
    tableBody.innerHTML = "";
    return;
  }

  if (state.documents.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          Aucun document enregistré.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML =
    state.documents
      .map(
        (documentItem) => {
          const publicUrl =
            getPublicUrl(
              documentItem.storage_path
            );

          const status =
            documentItem.publication_status ||
            "draft";

          const statusLabel =
            getDocumentStatusLabel(
              status
            );

          const statusClass =
            getDocumentStatusClass(
              status
            );

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    documentItem.file_name ||
                      "Document PDF"
                  )}
                </strong>

                <div class="table-subtext">
                  ${formatFileSize(
                    documentItem.file_size
                  )}
                </div>
              </td>

              <td>
                ${escapeHtml(
                  documentItem.organization_name ||
                    "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.alert_code ||
                    "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.region ||
                    "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  documentItem.commune ||
                    "—"
                )}
              </td>

              <td>
                <span class="status-badge ${statusClass}">
                  ${escapeHtml(
                    statusLabel
                  )}
                </span>
              </td>

              <td>
                ${formatDate(
                  documentItem.created_at
                )}
              </td>

              <td>
                <div class="table-actions">
                  ${
                    publicUrl
                      ? `
                        <a
                          class="button button-small button-secondary"
                          href="${escapeHtml(
                            publicUrl
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ouvrir
                        </a>
                      `
                      : ""
                  }

                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="replace-document"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Remplacer
                  </button>

                  <button
                    type="button"
                    class="button button-small button-secondary"
                    data-action="change-document-status"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Statut
                  </button>

                  <button
                    type="button"
                    class="button button-small button-danger"
                    data-action="delete-document"
                    data-id="${escapeHtml(
                      documentItem.id
                    )}"
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          `;
        }
      )
      .join("");
}

/* ==========================================================
   39. STATUTS DES DOCUMENTS
   ========================================================== */

function getDocumentStatusLabel(
  status
) {
  const labels = {
    published:
      "Publié",
    draft:
      "Brouillon",
    archived:
      "Archivé",
  };

  return (
    labels[status] ||
    status ||
    "Non défini"
  );
}

function getDocumentStatusClass(
  status
) {
  const classes = {
    published:
      "status-active",
    draft:
      "status-pending",
    archived:
      "status-inactive",
  };

  return (
    classes[status] ||
    "status-inactive"
  );
}

/**
 * Demande à l’administrateur le nouveau statut.
 */
async function changeDocumentStatus(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  const currentStatus =
    documentItem.publication_status ||
    "draft";

  const requestedStatus =
    window.prompt(
      [
        "Saisissez le nouveau statut :",
        "- published",
        "- draft",
        "- archived",
      ].join("\n"),
      currentStatus
    );

  if (
    requestedStatus === null
  ) {
    return;
  }

  const normalizedStatus =
    requestedStatus
      .trim()
      .toLowerCase();

  const allowedStatuses = [
    "published",
    "draft",
    "archived",
  ];

  if (
    !allowedStatuses.includes(
      normalizedStatus
    )
  ) {
    window.alert(
      "Statut invalide. Utilisez published, draft ou archived."
    );

    return;
  }

  if (
    normalizedStatus ===
    currentStatus
  ) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("documents")
    .update({
      publication_status:
        normalizedStatus,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      documentId
    );

  if (error) {
    window.alert(
      `Impossible de modifier le statut : ${error.message}`
    );

    return;
  }

  await loadDocuments();
}

/* ==========================================================
   40. REMPLACEMENT D'UN DOCUMENT PDF
   ========================================================== */

/**
 * Ouvre le sélecteur de fichier caché.
 */
function requestDocumentReplacement(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  let fileInput =
    getElement(
      "documentReplacementFile"
    );

  if (!fileInput) {
    fileInput =
      document.createElement(
        "input"
      );

    fileInput.type =
      "file";

    fileInput.accept =
      "application/pdf,.pdf";

    fileInput.id =
      "documentReplacementFile";

    fileInput.className =
      "hidden";

    document.body.appendChild(
      fileInput
    );

    fileInput.addEventListener(
      "change",
      handleDocumentReplacementFileChange
    );
  }

  fileInput.dataset.documentId =
    documentId;

  fileInput.value = "";

  fileInput.click();
}

/**
 * Reçoit le nouveau fichier sélectionné.
 */
async function handleDocumentReplacementFileChange(
  event
) {
  const fileInput =
    event.target;

  const documentId =
    fileInput.dataset.documentId;

  const file =
    fileInput.files?.[0];

  if (!documentId || !file) {
    return;
  }

  try {
    validatePdf(file);
  } catch (error) {
    window.alert(
      error.message
    );

    fileInput.value = "";
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    fileInput.value = "";
    return;
  }

  const confirmation =
    window.confirm(
      `Remplacer le fichier « ${documentItem.file_name} » par « ${file.name} » ?`
    );

  if (!confirmation) {
    fileInput.value = "";
    return;
  }

  await replaceDocumentFile(
    documentItem,
    file
  );

  fileInput.value = "";
}

/**
 * Remplace le PDF dans Supabase Storage
 * et met à jour les métadonnées.
 */
async function replaceDocumentFile(
  documentItem,
  file
) {
  const organization =
    state.organizations.find(
      (item) =>
        item.id ===
        documentItem.organization_id
    ) ||
    state.adminOrganizations.find(
      (item) =>
        item.id ===
        documentItem.organization_id
    ) ||
    {
      name:
        documentItem.organization_name ||
        "organisation",
      acronym: "",
    };

  const alertOption =
    getAlertById(
      documentItem.alert_id
    ) ||
    state.adminAlerts.find(
      (item) =>
        item.id ===
        documentItem.alert_id
    ) ||
    {
      alert_code:
        documentItem.alert_code ||
        "alerte",
    };

  const communeOption =
    getAlertCommuneById(
      documentItem.alert_commune_id
    ) || {
      alert_commune_id:
        documentItem.alert_commune_id,
      commune:
        documentItem.commune ||
        "commune",
    };

  const newStoragePath =
    buildDocumentStoragePath({
      organization,
      alertOption,
      communeOption,
      file,
    });

  let newFileUploaded =
    false;

  try {
    const {
      error: uploadError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .upload(
        newStoragePath,
        file,
        {
          cacheControl: "3600",
          contentType:
            "application/pdf",
          upsert: false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Impossible de charger le nouveau fichier : ${uploadError.message}`
      );
    }

    newFileUploaded = true;

    const {
      error: updateError,
    } = await supabase
      .from("documents")
      .update({
        file_name:
          file.name,
        storage_path:
          newStoragePath,
        file_size:
          file.size,
        mime_type:
          "application/pdf",
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        documentItem.id
      );

    if (updateError) {
      throw new Error(
        `Impossible de mettre à jour le document : ${updateError.message}`
      );
    }

    /*
     * L’ancien fichier n’est supprimé
     * qu’après la mise à jour réussie
     * de la base de données.
     */
    if (
      documentItem.storage_path &&
      documentItem.storage_path !==
        newStoragePath
    ) {
      const {
        error: removeOldError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          documentItem.storage_path,
        ]);

      if (removeOldError) {
        console.warn(
          "Le document a été mis à jour, mais l’ancien fichier n’a pas pu être supprimé :",
          removeOldError.message
        );
      }
    }

    window.alert(
      "Le fichier PDF a été remplacé avec succès."
    );

    await loadDocuments();
  } catch (error) {
    /*
     * Nettoyage du nouveau fichier
     * si la mise à jour en base échoue.
     */
    if (newFileUploaded) {
      const {
        error: rollbackError,
      } = await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          newStoragePath,
        ]);

      if (rollbackError) {
        console.warn(
          "Le nouveau fichier n’a pas pu être supprimé après l’échec :",
          rollbackError.message
        );
      }
    }

    window.alert(
      error.message ||
        "Impossible de remplacer le document."
    );
  }
}

/* ==========================================================
   41. SUPPRESSION D'UN DOCUMENT
   ========================================================== */

async function deleteDocument(
  documentId
) {
  if (!state.isAdmin) {
    openLoginModal();
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id ===
        documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  const confirmation =
    window.confirm(
      [
        `Supprimer définitivement le document « ${documentItem.file_name} » ?`,
        "",
        "Cette action supprimera également le fichier PDF dans Supabase Storage.",
      ].join("\n")
    );

  if (!confirmation) {
    return;
  }

  /*
   * La suppression commence par la ligne
   * en base de données.
   *
   * Cela évite de laisser une référence
   * vers un fichier déjà supprimé lorsque
   * la suppression SQL échoue.
   */
  const {
    error: deleteError,
  } = await supabase
    .from("documents")
    .delete()
    .eq(
      "id",
      documentId
    );

  if (deleteError) {
    window.alert(
      `Impossible de supprimer le document : ${deleteError.message}`
    );

    return;
  }

  /*
   * Suppression du fichier Storage.
   *
   * Si cette étape échoue, la fiche est déjà
   * retirée de la base, mais un fichier orphelin
   * peut rester dans le bucket.
   */
  if (
    documentItem.storage_path
  ) {
    const {
      error: storageError,
    } = await supabase.storage
      .from(
        CONFIG.STORAGE_BUCKET
      )
      .remove([
        documentItem.storage_path,
      ]);

    if (storageError) {
      console.warn(
        "La fiche a été supprimée, mais le fichier Storage est resté présent :",
        storageError.message
      );

      window.alert(
        [
          "La fiche a été supprimée de la base de données.",
          "Cependant, le fichier n’a pas pu être supprimé du stockage.",
          "Une intervention manuelle dans Supabase Storage peut être nécessaire.",
        ].join("\n")
      );
    } else {
      window.alert(
        "Le document a été supprimé avec succès."
      );
    }
  } else {
    window.alert(
      "Le document a été supprimé avec succès."
    );
  }

  await loadDocuments();
}

/* ==========================================================
   42. ACTIONS DU TABLEAU DES DOCUMENTS
   ========================================================== */

function handleAdminDocumentTableClick(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const documentId =
    button.dataset.id;

  if (!documentId) {
    return;
  }

  switch (
    button.dataset.action
  ) {
    case "replace-document":
      requestDocumentReplacement(
        documentId
      );
      break;

    case "change-document-status":
      changeDocumentStatus(
        documentId
      );
      break;

    case "delete-document":
      deleteDocument(
        documentId
      );
      break;

    default:
      break;
  }
}
/* ==========================================================
   43. GESTION DES EVENEMENTS GENERAUX
   ========================================================== */

function initializeEvents() {
  /* --------------------------------------------------------
     Navigation
     -------------------------------------------------------- */

  initializeNavigation();

  /* --------------------------------------------------------
     Authentification
     -------------------------------------------------------- */

  getElement("loginButton")
    ?.addEventListener(
      "click",
      openLoginModal
    );

  getElement("logoutButton")
    ?.addEventListener(
      "click",
      handleLogout
    );

  getElement("closeLoginModal")
    ?.addEventListener(
      "click",
      closeLoginModal
    );

  getElement("cancelLoginButton")
    ?.addEventListener(
      "click",
      closeLoginModal
    );

  getElement("loginForm")
    ?.addEventListener(
      "submit",
      handleAdminLogin
    );

  getElement("loginModal")
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target.id ===
          "loginModal"
        ) {
          closeLoginModal();
        }
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeLoginModal();
      }
    }
  );

  /* --------------------------------------------------------
     Publication publique
     -------------------------------------------------------- */

  getElement(
    "publishOrganization"
  )?.addEventListener(
    "change",
    handlePublishOrganizationChange
  );

  getElement(
    "publishAlert"
  )?.addEventListener(
    "change",
    handlePublishAlertChange
  );

  getElement(
    "publishCommune"
  )?.addEventListener(
    "change",
    handlePublishCommuneChange
  );

  getElement(
    "publishFile"
  )?.addEventListener(
    "change",
    handlePublishFileChange
  );

  getElement(
    "publishForm"
  )?.addEventListener(
    "submit",
    handlePublicPublication
  );

  getElement(
    "resetPublishButton"
  )?.addEventListener(
    "click",
    () => {
      resetPublishForm();

      hideMessage(
        getElement(
          "publishMessage"
        )
      );
    }
  );

  /* --------------------------------------------------------
     Recherche et filtres documentaires
     -------------------------------------------------------- */

  getElement(
    "documentSearch"
  )?.addEventListener(
    "input",
    renderDocuments
  );

  getElement(
    "filterOrganization"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "filterAlert"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "filterCommune"
  )?.addEventListener(
    "change",
    renderDocuments
  );

  getElement(
    "resetFiltersButton"
  )?.addEventListener(
    "click",
    resetDocumentFilters
  );

  /* --------------------------------------------------------
     Formulaire d’administration des organisations
     -------------------------------------------------------- */

  getElement(
    "organizationForm"
  )?.addEventListener(
    "submit",
    handleOrganizationSubmit
  );

  getElement(
    "resetOrganizationButton"
  )?.addEventListener(
    "click",
    resetOrganizationForm
  );

  getElement(
    "adminOrganizationsTable"
  )?.addEventListener(
    "click",
    handleAdminOrganizationTableClick
  );

  /* --------------------------------------------------------
     Formulaire d’administration des alertes
     -------------------------------------------------------- */

  getElement(
    "alertForm"
  )?.addEventListener(
    "submit",
    handleAlertSubmit
  );

  getElement(
    "resetAlertButton"
  )?.addEventListener(
    "click",
    resetAlertForm
  );

  getElement(
    "adminAlertsTable"
  )?.addEventListener(
    "click",
    handleAdminAlertTableClick
  );

  /* --------------------------------------------------------
     Import CSV
     -------------------------------------------------------- */

  getElement(
    "alertCsvForm"
  )?.addEventListener(
    "submit",
    handleAlertCsvImport
  );

  getElement(
    "alertCsvPreviewButton"
  )?.addEventListener(
    "click",
    handleAlertCsvPreview
  );

  getElement(
    "resetAlertCsvButton"
  )?.addEventListener(
    "click",
    resetAlertCsvImport
  );

  getElement(
    "alertCsvFile"
  )?.addEventListener(
    "change",
    () => {
      const preview =
        getElement(
          "alertCsvPreview"
        );

      if (preview) {
        preview.innerHTML = "";
        preview.classList.add(
          "hidden"
        );
      }

      hideMessage(
        getElement(
          "alertCsvMessage"
        )
      );
    }
  );

  /* --------------------------------------------------------
     Administration des documents
     -------------------------------------------------------- */

  getElement(
    "adminDocumentsTable"
  )?.addEventListener(
    "click",
    handleAdminDocumentTableClick
  );

  /* --------------------------------------------------------
     Actualisation manuelle
     -------------------------------------------------------- */

  getElement(
    "refreshDocumentsButton"
  )?.addEventListener(
    "click",
    async () => {
      const button =
        getElement(
          "refreshDocumentsButton"
        );

      setButtonLoading(
        button,
        true,
        "Actualisation..."
      );

      try {
        await loadDocuments();
      } catch (error) {
        window.alert(
          error.message ||
            "Impossible d’actualiser les documents."
        );
      } finally {
        setButtonLoading(
          button,
          false
        );
      }
    }
  );

  getElement(
    "refreshAdminButton"
  )?.addEventListener(
    "click",
    async () => {
      const button =
        getElement(
          "refreshAdminButton"
        );

      if (!state.isAdmin) {
        openLoginModal();
        return;
      }

      setButtonLoading(
        button,
        true,
        "Actualisation..."
      );

      try {
        await refreshApplicationData();
      } catch (error) {
        window.alert(
          error.message ||
            "Impossible d’actualiser les données."
        );
      } finally {
        setButtonLoading(
          button,
          false
        );
      }
    }
  );
}

/* ==========================================================
   44. ACTUALISATION COMPLETE DES DONNEES
   ========================================================== */

async function refreshApplicationData() {
  await Promise.all([
    loadPublicOrganizations(),
    loadPublicAlerts(),
    loadPublicAlertCommuneOptions(),
  ]);

  await loadDocuments();

  if (state.isAdmin) {
    await loadAdminData();
  }

  updatePublishSummary();
}

/* ==========================================================
   45. ETAT VISUEL DE CHARGEMENT INITIAL
   ========================================================== */

function setInitialLoadingState(
  isLoading
) {
  const loadingElement =
    getElement(
      "applicationLoading"
    );

  const applicationElement =
    getElement(
      "applicationContent"
    );

  if (loadingElement) {
    loadingElement.classList.toggle(
      "hidden",
      !isLoading
    );
  }

  if (applicationElement) {
    applicationElement.classList.toggle(
      "hidden",
      isLoading
    );
  }
}

/* ==========================================================
   46. AFFICHAGE DES ERREURS D'INITIALISATION
   ========================================================== */

function showInitializationError(
  error
) {
  console.error(
    "Erreur d’initialisation de l’application :",
    error
  );

  const errorContainer =
    getElement(
      "applicationError"
    );

  if (errorContainer) {
    errorContainer.innerHTML = `
      <div class="message message-error">
        <strong>
          Impossible de démarrer l’application.
        </strong>

        <p>
          ${escapeHtml(
            error.message ||
              "Une erreur inattendue est survenue."
          )}
        </p>

        <button
          type="button"
          class="button button-primary"
          id="retryInitializationButton"
        >
          Réessayer
        </button>
      </div>
    `;

    errorContainer.classList.remove(
      "hidden"
    );

    getElement(
      "retryInitializationButton"
    )?.addEventListener(
      "click",
      () => {
        window.location.reload();
      }
    );

    return;
  }

  window.alert(
    error.message ||
      "Impossible de démarrer l’application."
  );
}

/* ==========================================================
   47. VERIFICATION DE LA CONFIGURATION
   ========================================================== */

function validateConfiguration() {
  const missingValues = [];

  if (
    !CONFIG.SUPABASE_URL
  ) {
    missingValues.push(
      "SUPABASE_URL"
    );
  }

  if (
    !CONFIG.SUPABASE_PUBLISHABLE_KEY
  ) {
    missingValues.push(
      "SUPABASE_PUBLISHABLE_KEY"
    );
  }

  if (
    !CONFIG.STORAGE_BUCKET
  ) {
    missingValues.push(
      "STORAGE_BUCKET"
    );
  }

  if (
    missingValues.length > 0
  ) {
    throw new Error(
      `Configuration incomplète : ${missingValues.join(", ")}.`
    );
  }

  if (
    !Number.isFinite(
      Number(
        CONFIG.MAX_FILE_SIZE
      )
    )
  ) {
    throw new Error(
      "La valeur CONFIG.MAX_FILE_SIZE est invalide."
    );
  }
}

/* ==========================================================
   48. PREPARATION DE L'INTERFACE
   ========================================================== */

function initializeInterface() {
  resetPublishForm();
  resetOrganizationForm();
  resetAlertForm();
  resetAlertCsvImport();
  resetDocumentFilters();

  updateAuthenticationInterface();
  updatePublishSummary();

  const defaultView =
    document.querySelector(
      ".view.active-view"
    )
      ? null
      : "home";

  if (defaultView) {
    showView(defaultView);
  }
}

/* ==========================================================
   49. CHARGEMENT INITIAL DES DONNEES
   ========================================================== */

async function loadInitialData() {
  const results =
    await Promise.allSettled([
      loadPublicOrganizations(),
      loadPublicAlerts(),
      loadPublicAlertCommuneOptions(),
    ]);

  results.forEach(
    (result) => {
      if (
        result.status === "rejected"
      ) {
        console.error(
          "Erreur de chargement :",
          result.reason
        );
      }
    }
  );

  try {
    await loadDocuments();
  } catch (error) {
    console.error(
      "Erreur de chargement des documents :",
      error
    );
  }

  if (state.isAdmin) {
    try {
      await loadAdminData();
    } catch (error) {
      console.error(
        "Erreur de chargement de l’administration :",
        error
      );
    }
  }
}
/* ==========================================================
   50. DEMARRAGE DE L'APPLICATION
   ========================================================== */

async function initializeApplication() {
  setInitialLoadingState(
    true
  );

  try {
    validateConfiguration();

    initializeEvents();

    await initializeAuthentication();

    initializeInterface();

    await loadInitialData();

    setInitialLoadingState(
      false
    );
  } catch (error) {
    setInitialLoadingState(
      false
    );

    showInitializationError(
      error
    );
  }
}

/* ==========================================================
   51. LANCEMENT APRES CHARGEMENT DU DOM
   ========================================================== */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApplication
  );
} else {
  initializeApplication();
}
