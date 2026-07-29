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
  alertOptions: [],
  documents: [],

  adminOrganizations: [],
  adminAlerts: [],

  selectedPublishAlert: null,
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
  element.className = "message hidden";
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
    button.dataset.originalText =
      button.textContent;

    button.disabled = true;
    button.textContent = loadingText;
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
      values.filter(Boolean)
    ),
  ].sort((a, b) =>
    String(a).localeCompare(
      String(b),
      "fr",
      {
        sensitivity: "base",
      }
    )
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
  }

  state.adminProfile = data || null;

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

  if (
    state.isAdmin &&
    adminIdentity
  ) {
    const identity =
      state.adminProfile
        ?.full_name ||
      state.session
        ?.user
        ?.email ||
      "Administrateur";

    adminIdentity.textContent =
      `Connecté en tant que ${identity}.`;
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
   7. CHARGEMENT DES ALERTES PUBLIQUES
   ========================================================== */

async function loadPublicAlertOptions() {
  const {
    data,
    error,
  } = await supabase
    .from(
      "organization_alert_options"
    )
    .select(`
      association_id,
      organization_id,
      organization_name,
      organization_acronym,
      organization_slug,
      organization_is_active,
      alert_id,
      alert_code,
      sector,
      commune,
      province,
      region,
      alert_is_active,
      association_is_active
    `)
    .eq(
      "organization_is_active",
      true
    )
    .eq(
      "alert_is_active",
      true
    )
    .eq(
      "association_is_active",
      true
    )
    .order("alert_code", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les Alertes ID : ${error.message}`
    );
  }

  state.alertOptions =
    data || [];

  populateAlertFilters();
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
    {
      id: "alertOrganization",
      label:
        "Sélectionner une organisation",
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
        `<option value="">${label}</option>`;

      state.organizations.forEach(
        (organization) => {
          const option =
            document.createElement(
              "option"
            );

          option.value =
            organization.id;

          option.textContent =
            organization.name;

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

function populateAlertFilters() {
  const alertSelect =
    getElement("filterAlert");

  if (!alertSelect) {
    return;
  }

  const currentValue =
    alertSelect.value;

  const alerts =
    Array.from(
      new Map(
        state.alertOptions.map(
          (item) => [
            item.alert_code,
            item,
          ]
        )
      ).values()
    );

  alertSelect.innerHTML = `
    <option value="">
      Toutes les alertes
    </option>
  `;

  alerts.forEach((item) => {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.alert_code;

    option.textContent =
      item.alert_code;

    alertSelect.appendChild(option);
  });

  if (
    alerts.some(
      (item) =>
        item.alert_code ===
        currentValue
    )
  ) {
    alertSelect.value =
      currentValue;
  }
}

/* ==========================================================
   9. FORMULAIRE PUBLIC DE PUBLICATION
   ========================================================== */

function handlePublishOrganizationChange() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value;

  const alertSelect =
    getElement("publishAlert");

  if (!alertSelect) {
    return;
  }

  state.selectedPublishAlert =
    null;

  resetPublishMetadata();

  if (!organizationId) {
    alertSelect.disabled = true;

    alertSelect.innerHTML = `
      <option value="">
        Sélectionner d’abord l’organisation
      </option>
    `;

    updatePublishSummary();

    return;
  }

  const matchingAlerts =
    state.alertOptions.filter(
      (item) =>
        item.organization_id ===
        organizationId
    );

  alertSelect.innerHTML = `
    <option value="">
      Sélectionner une Alerte ID
    </option>
  `;

  matchingAlerts.forEach((item) => {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.alert_id;

    option.textContent =
      `${item.alert_code} — ${item.commune}`;

    alertSelect.appendChild(option);
  });

  if (
    matchingAlerts.length === 0
  ) {
    alertSelect.disabled = true;

    alertSelect.innerHTML = `
      <option value="">
        Aucune Alerte ID associée
      </option>
    `;
  } else {
    alertSelect.disabled = false;
  }

  updatePublishSummary();
}

function handlePublishAlertChange() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value;

  const alertId =
    getElement("publishAlert")
      ?.value;

  state.selectedPublishAlert =
    state.alertOptions.find(
      (item) =>
        item.organization_id ===
          organizationId &&
        item.alert_id ===
          alertId
    ) || null;

  const sectorInput =
    getElement("publishSector");

  const communeInput =
    getElement("publishCommune");

  if (sectorInput) {
    sectorInput.value =
      state.selectedPublishAlert
        ?.sector || "";
  }

  if (communeInput) {
    communeInput.value =
      state.selectedPublishAlert
        ?.commune || "";
  }

  updatePublishSummary();
}

function resetPublishMetadata() {
  const sectorInput =
    getElement("publishSector");

  const communeInput =
    getElement("publishCommune");

  if (sectorInput) {
    sectorInput.value = "";
  }

  if (communeInput) {
    communeInput.value = "";
  }
}

function handlePublishFileChange() {
  const file =
    getElement("publishFile")
      ?.files?.[0];

  const fileInfo =
    getElement(
      "selectedFileInfo"
    );

  if (!fileInfo) {
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
    getElement("publishFile").value =
      "";

    fileInfo.classList.add(
      "hidden"
    );

    window.alert(error.message);
  }

  updatePublishSummary();
}

function updatePublishSummary() {
  const organizationId =
    getElement(
      "publishOrganization"
    )?.value;

  const organization =
    state.organizations.find(
      (item) =>
        item.id === organizationId
    );

  const file =
    getElement("publishFile")
      ?.files?.[0];

  if (
    getElement(
      "summaryOrganization"
    )
  ) {
    getElement(
      "summaryOrganization"
    ).textContent =
      organization?.name || "—";
  }

  if (
    getElement("summaryAlert")
  ) {
    getElement(
      "summaryAlert"
    ).textContent =
      state.selectedPublishAlert
        ?.alert_code || "—";
  }

  if (
    getElement("summarySector")
  ) {
    getElement(
      "summarySector"
    ).textContent =
      state.selectedPublishAlert
        ?.sector || "—";
  }

  if (
    getElement("summaryCommune")
  ) {
    getElement(
      "summaryCommune"
    ).textContent =
      state.selectedPublishAlert
        ?.commune || "—";
  }

  if (
    getElement("summaryFile")
  ) {
    getElement(
      "summaryFile"
    ).textContent =
      file?.name || "—";
  }
}

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

  wrapper.classList.remove(
    "hidden"
  );

  const normalizedValue =
    Math.min(
      100,
      Math.max(0, value)
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

async function handlePublicPublication(
  event
) {
  event.preventDefault();

  const messageElement =
    getElement("publishMessage");

  const submitButton =
    getElement(
      "publishSubmitButton"
    );

  hideMessage(messageElement);

  let uploadedStoragePath = null;

  try {
    const organizationId =
      getElement(
        "publishOrganization"
      )?.value;

    const alertId =
      getElement("publishAlert")
        ?.value;

    const file =
      getElement("publishFile")
        ?.files?.[0];

    const organization =
      state.organizations.find(
        (item) =>
          item.id === organizationId
      );

    const alertOption =
      state.alertOptions.find(
        (item) =>
          item.organization_id ===
            organizationId &&
          item.alert_id === alertId
      );

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

    validatePdf(file);

    setButtonLoading(
      submitButton,
      true,
      "Publication..."
    );

    updatePublishProgress(10);

    const safeFileName =
      sanitizeFileName(file.name);

    const storagePath = [
      slugify(organization.name),
      slugify(
        alertOption.alert_code
      ),
      `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`,
    ].join("/");

    uploadedStoragePath =
      storagePath;

    const {
      error: uploadError,
    } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
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

    const documentRecord = {
      organization_id:
        organization.id,

      alert_id:
        alertOption.alert_id,

      organization_name:
        organization.name,

      alert_code:
        alertOption.alert_code,

      sector:
        alertOption.sector,

      commune:
        alertOption.commune,

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
      .insert(documentRecord);

    if (insertError) {
      await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          storagePath,
        ]);

      uploadedStoragePath =
        null;

      throw new Error(
        `Enregistrement des métadonnées impossible : ${insertError.message}`
      );
    }

    updatePublishProgress(100);

    showMessage(
      messageElement,
      "La fiche a été publiée avec succès.",
      "success"
    );

    getElement("publishForm")
      ?.reset();

    const alertSelect =
      getElement("publishAlert");

    if (alertSelect) {
      alertSelect.disabled = true;

      alertSelect.innerHTML = `
        <option value="">
          Sélectionner d’abord l’organisation
        </option>
      `;
    }

    resetPublishMetadata();

    const fileInfo =
      getElement(
        "selectedFileInfo"
      );

    fileInfo?.classList.add(
      "hidden"
    );

    if (fileInfo) {
      fileInfo.innerHTML = "";
    }

    state.selectedPublishAlert =
      null;

    updatePublishSummary();

    await loadDocuments();
  } catch (error) {
    if (uploadedStoragePath) {
      console.warn(
        "Un fichier peut rester dans Storage :",
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
   10. CHARGEMENT DES DOCUMENTS
   ========================================================== */

async function loadDocuments() {
  const query = supabase
    .from("documents")
    .select(`
      id,
      organization_id,
      alert_id,
      organization_name,
      alert_code,
      sector,
      commune,
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

  if (!state.isAdmin) {
    query.eq(
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

  state.documents =
    data || [];

  renderDocuments();
  renderStatistics();
  populateDocumentFilters();

  if (state.isAdmin) {
    renderAdminDocuments();
  }
}

/* ==========================================================
   11. FILTRAGE DES DOCUMENTS
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

  const sector =
    getElement("filterSector")
      ?.value || "";

  const commune =
    getElement("filterCommune")
      ?.value || "";

  return state.documents.filter(
    (documentItem) => {
      if (
        documentItem
          .publication_status !==
          "published" &&
        !state.isAdmin
      ) {
        return false;
      }

      const searchableText = [
        documentItem.file_name,
        documentItem.organization_name,
        documentItem.alert_code,
        documentItem.sector,
        documentItem.commune,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !search ||
        searchableText.includes(
          search
        );

      const matchesOrganization =
        !organizationId ||
        documentItem.organization_id ===
          organizationId;

      const matchesAlert =
        !alertCode ||
        documentItem.alert_code ===
          alertCode;

      const matchesSector =
        !sector ||
        documentItem.sector ===
          sector;

      const matchesCommune =
        !commune ||
        documentItem.commune ===
          commune;

      return (
        matchesSearch &&
        matchesOrganization &&
        matchesAlert &&
        matchesSector &&
        matchesCommune
      );
    }
  );
}

/* ==========================================================
   12. AFFICHAGE DES DOCUMENTS
   ========================================================== */

function renderDocuments() {
  const container =
    getElement("documentsList");

  if (!container) {
    return;
  }

  const documents =
    getFilteredDocuments().filter(
      (item) =>
        item.publication_status ===
        "published"
    );

  const resultTitle =
    getElement(
      "documentsResultTitle"
    );

  if (resultTitle) {
    resultTitle.textContent =
      `${documents.length} document${
        documents.length > 1
          ? "s"
          : ""
      }`;
  }

  if (documents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>
          Aucun document trouvé
        </h3>

        <p>
          Modifiez les filtres ou publiez une nouvelle fiche.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    documents
      .map((documentItem) => {
        const publicUrl =
          getPublicUrl(
            documentItem.storage_path
          );

        return `
          <article class="document-card">
            <div class="document-card-header">
              <span class="document-type">
                PDF
              </span>

              <span class="sector-badge">
                ${escapeHtml(
                  documentItem.sector
                )}
              </span>
            </div>

            <h3>
              ${escapeHtml(
                documentItem.file_name
              )}
            </h3>

            <dl class="document-metadata">
              <div>
                <dt>
                  Organisation
                </dt>

                <dd>
                  ${escapeHtml(
                    documentItem
                      .organization_name
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Alerte ID
                </dt>

                <dd>
                  ${escapeHtml(
                    documentItem
                      .alert_code
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Commune
                </dt>

                <dd>
                  ${escapeHtml(
                    documentItem
                      .commune
                  )}
                </dd>
              </div>
            </dl>

            <div class="document-card-footer">
              <span>
                ${formatFileSize(
                  documentItem
                    .file_size
                )}
              </span>

              <span>
                ${formatDate(
                  documentItem
                    .created_at
                )}
              </span>
            </div>

            <a
              class="button button-primary button-full"
              href="${escapeHtml(
                publicUrl
              )}"
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              Télécharger
            </a>
          </article>
        `;
      })
      .join("");
}

/* ==========================================================
   13. STATISTIQUES
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
      publishedDocuments.map(
        (item) =>
          item.organization_id
      )
    );

  const alerts =
    new Set(
      publishedDocuments.map(
        (item) =>
          item.alert_code
      )
    );

  const communes =
    new Set(
      publishedDocuments.map(
        (item) =>
          item.commune
      )
    );

  if (
    getElement("documentsCount")
  ) {
    getElement(
      "documentsCount"
    ).textContent =
      publishedDocuments.length;
  }

  if (
    getElement("organizationsCount")
  ) {
    getElement(
      "organizationsCount"
    ).textContent =
      organizations.size;
  }

  if (
    getElement("alertsCount")
  ) {
    getElement(
      "alertsCount"
    ).textContent =
      alerts.size;
  }

  if (
    getElement("communesCount")
  ) {
    getElement(
      "communesCount"
    ).textContent =
      communes.size;
  }
}

function populateDocumentFilters() {
  populateUniqueSelect(
    "filterSector",
    state.documents.map(
      (item) => item.sector
    ),
    "Tous les secteurs"
  );

  populateUniqueSelect(
    "filterCommune",
    state.documents.map(
      (item) => item.commune
    ),
    "Toutes les communes"
  );
}

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
      ${defaultLabel}
    </option>
  `;

  valuesList.forEach((value) => {
    const option =
      document.createElement(
        "option"
      );

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  });

  if (
    valuesList.includes(
      currentValue
    )
  ) {
    select.value =
      currentValue;
  }
}

function resetDocumentFilters() {
  const ids = [
    "documentSearch",
    "filterOrganization",
    "filterAlert",
    "filterSector",
    "filterCommune",
  ];

  ids.forEach((id) => {
    const element =
      getElement(id);

    if (element) {
      element.value = "";
    }
  });

  renderDocuments();
}

/* ==========================================================
   14. ADMINISTRATION DES ORGANISATIONS
   ========================================================== */

async function loadAdminOrganizations() {
  if (!state.isAdmin) {
    return;
  }

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
      `Impossible de charger les organisations administratives : ${error.message}`
    );
  }

  state.adminOrganizations =
    data || [];

  renderAdminOrganizations();
}

function renderAdminOrganizations() {
  const table =
    getElement(
      "adminOrganizationsTable"
    );

  if (!table) {
    return;
  }

  if (
    state.adminOrganizations.length ===
    0
  ) {
    table.innerHTML = `
      <tr>
        <td colspan="4">
          Aucune organisation enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  table.innerHTML =
    state.adminOrganizations
      .map((organization) => `
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
            <span class="${
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
            <button
              type="button"
              class="table-action"
              data-edit-organization="${organization.id}"
            >
              Modifier
            </button>
          </td>
        </tr>
      `)
      .join("");

  table
    .querySelectorAll(
      "[data-edit-organization]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          editOrganization(
            button.dataset
              .editOrganization
          );
        }
      );
    });
}

function editOrganization(id) {
  const organization =
    state.adminOrganizations.find(
      (item) => item.id === id
    );

  if (!organization) {
    return;
  }

  getElement(
    "organizationId"
  ).value =
    organization.id;

  getElement(
    "organizationName"
  ).value =
    organization.name;

  getElement(
    "organizationAcronym"
  ).value =
    organization.acronym || "";

  getElement(
    "organizationActive"
  ).value =
    String(
      organization.is_active
    );

  getElement(
    "organizationName"
  )?.focus();
}

function resetOrganizationForm() {
  getElement(
    "organizationForm"
  )?.reset();

  getElement(
    "organizationId"
  ).value = "";

  getElement(
    "organizationActive"
  ).value = "true";
}

async function saveOrganization(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    window.alert(
      "Accès administrateur requis."
    );

    return;
  }

  const submitButton =
    event.submitter;

  const id =
    getElement(
      "organizationId"
    )?.value;

  const name =
    getElement(
      "organizationName"
    )?.value
      .trim();

  const acronym =
    getElement(
      "organizationAcronym"
    )?.value
      .trim();

  const isActive =
    getElement(
      "organizationActive"
    )?.value === "true";

  if (!name) {
    window.alert(
      "Le nom de l’organisation est obligatoire."
    );

    return;
  }

  const record = {
    name,
    acronym:
      acronym || null,
    slug: slugify(name),
    is_active:
      isActive,
  };

  setButtonLoading(
    submitButton,
    true,
    "Enregistrement..."
  );

  try {
    let error;

    if (id) {
      ({
        error,
      } = await supabase
        .from("organizations")
        .update(record)
        .eq("id", id));
    } else {
      ({
        error,
      } = await supabase
        .from("organizations")
        .insert(record));
    }

    if (error) {
      throw error;
    }

    await writeAdminLog(
      id ? "update" : "create",
      "organization",
      id || null,
      record
    );

    resetOrganizationForm();

    await Promise.all([
      loadAdminOrganizations(),
      loadPublicOrganizations(),
    ]);
  } catch (error) {
    window.alert(
      `Enregistrement impossible : ${error.message}`
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   15. ADMINISTRATION DES ALERTES
   ========================================================== */

async function loadAdminAlerts() {
  if (!state.isAdmin) {
    return;
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "organization_alert_options"
    )
    .select(`
      association_id,
      organization_id,
      organization_name,
      organization_acronym,
      organization_slug,
      organization_is_active,
      alert_id,
      alert_code,
      sector,
      commune,
      province,
      region,
      alert_is_active,
      association_is_active
    `)
    .order("alert_code", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Impossible de charger les alertes administratives : ${error.message}`
    );
  }

  state.adminAlerts =
    data || [];

  renderAdminAlerts();
}

function renderAdminAlerts() {
  const table =
    getElement("adminAlertsTable");

  if (!table) {
    return;
  }

  if (
    state.adminAlerts.length === 0
  ) {
    table.innerHTML = `
      <tr>
        <td colspan="6">
          Aucune alerte enregistrée.
        </td>
      </tr>
    `;

    return;
  }

  table.innerHTML =
    state.adminAlerts
      .map((item) => `
        <tr>
          <td>
            ${escapeHtml(
              item.alert_code
            )}
          </td>

          <td>
            ${escapeHtml(
              item.organization_name
            )}
          </td>

          <td>
            ${escapeHtml(
              item.sector
            )}
          </td>

          <td>
            ${escapeHtml(
              item.commune
            )}
          </td>

          <td>
            <span class="${
              item.alert_is_active &&
              item.association_is_active
                ? "status-active"
                : "status-inactive"
            }">
              ${
                item.alert_is_active &&
                item.association_is_active
                  ? "Active"
                  : "Inactive"
              }
            </span>
          </td>

          <td>
            <button
              type="button"
              class="table-action"
              data-edit-alert="${item.alert_id}"
              data-edit-alert-organization="${item.organization_id}"
            >
              Modifier
            </button>
          </td>
        </tr>
      `)
      .join("");

  table
    .querySelectorAll(
      "[data-edit-alert]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          editAlert(
            button.dataset
              .editAlert,

            button.dataset
              .editAlertOrganization
          );
        }
      );
    });
}

function editAlert(
  alertId,
  organizationId
) {
  const item =
    state.adminAlerts.find(
      (alertItem) =>
        alertItem.alert_id ===
          alertId &&
        alertItem.organization_id ===
          organizationId
    );

  if (!item) {
    return;
  }

  getElement(
    "alertDatabaseId"
  ).value =
    item.alert_id;

  getElement(
    "alertCode"
  ).value =
    item.alert_code;

  getElement(
    "alertSector"
  ).value =
    item.sector;

  getElement(
    "alertCommune"
  ).value =
    item.commune;

  getElement(
    "alertProvince"
  ).value =
    item.province || "";

  getElement(
    "alertRegion"
  ).value =
    item.region || "";

  getElement(
    "alertOrganization"
  ).value =
    item.organization_id;

  getElement(
    "alertActive"
  ).value =
    String(
      item.alert_is_active &&
      item.association_is_active
    );

  getElement(
    "alertCode"
  )?.focus();
}

function resetAlertForm() {
  getElement(
    "alertForm"
  )?.reset();

  getElement(
    "alertDatabaseId"
  ).value = "";

  getElement(
    "alertActive"
  ).value = "true";
}

async function saveAlert(event) {
  event.preventDefault();

  if (!state.isAdmin) {
    window.alert(
      "Accès administrateur requis."
    );

    return;
  }

  const submitButton =
    event.submitter;

  const existingAlertId =
    getElement(
      "alertDatabaseId"
    )?.value;

  const organizationId =
    getElement(
      "alertOrganization"
    )?.value;

  const alertCode =
    getElement("alertCode")
      ?.value
      .trim();

  const sector =
    getElement("alertSector")
      ?.value
      .trim();

  const commune =
    getElement("alertCommune")
      ?.value
      .trim();

  const province =
    getElement("alertProvince")
      ?.value
      .trim();

  const region =
    getElement("alertRegion")
      ?.value
      .trim();

  const isActive =
    getElement("alertActive")
      ?.value === "true";

  if (
    !organizationId ||
    !alertCode ||
    !sector ||
    !commune
  ) {
    window.alert(
      "Organisation, Alerte ID, secteur et commune sont obligatoires."
    );

    return;
  }

  const alertRecord = {
    alert_code: alertCode,
    sector,
    commune,
    province:
      province || null,
    region:
      region || null,
    is_active:
      isActive,
  };

  setButtonLoading(
    submitButton,
    true,
    "Enregistrement..."
  );

  try {
    let alertId =
      existingAlertId;

    if (existingAlertId) {
      const {
        error,
      } = await supabase
        .from("alerts")
        .update(alertRecord)
        .eq(
          "id",
          existingAlertId
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
        .upsert(
          alertRecord,
          {
            onConflict:
              "alert_code",
          }
        )
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      alertId = data.id;
    }

    const associationRecord = {
      organization_id:
        organizationId,

      alert_id:
        alertId,

      is_active:
        isActive,
    };

    const {
      error: associationError,
    } = await supabase
      .from(
        "organization_alerts"
      )
      .upsert(
        associationRecord,
        {
          onConflict:
            "organization_id,alert_id",
        }
      );

    if (associationError) {
      throw associationError;
    }

    await writeAdminLog(
      existingAlertId
        ? "update"
        : "create",
      "alert",
      alertId,
      {
        ...alertRecord,
        organization_id:
          organizationId,
      }
    );

    resetAlertForm();

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlertOptions(),
    ]);
  } catch (error) {
    window.alert(
      `Enregistrement impossible : ${error.message}`
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

/* ==========================================================
   16. LECTURE ET IMPORT CSV
   ========================================================== */

function detectCsvSeparator(
  firstLine
) {
  const semicolonCount =
    (
      firstLine.match(/;/g) ||
      []
    ).length;

  const commaCount =
    (
      firstLine.match(/,/g) ||
      []
    ).length;

  return semicolonCount >
    commaCount
    ? ";"
    : ",";
}

function parseCsvLine(
  line,
  separator
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

    if (character === '"') {
      if (
        insideQuotes &&
        line[index + 1] === '"'
      ) {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes =
          !insideQuotes;
      }
    } else if (
      character === separator &&
      !insideQuotes
    ) {
      values.push(
        currentValue.trim()
      );

      currentValue = "";
    } else {
      currentValue +=
        character;
    }
  }

  values.push(
    currentValue.trim()
  );

  return values;
}

function parseCsv(text) {
  const normalizedText =
    text.replace(/^\uFEFF/, "");

  const lines =
    normalizedText
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.trim() !== ""
      );

  if (lines.length < 2) {
    throw new Error(
      "Le fichier CSV ne contient aucune donnée exploitable."
    );
  }

  const separator =
    detectCsvSeparator(
      lines[0]
    );

  const headers =
    parseCsvLine(
      lines[0],
      separator
    ).map((header) =>
      header
        .trim()
        .toLowerCase()
    );

  return lines
    .slice(1)
    .map((line) => {
      const values =
        parseCsvLine(
          line,
          separator
        );

      return headers.reduce(
        (
          record,
          header,
          index
        ) => {
          record[header] =
            values[index]
              ?.trim() || "";

          return record;
        },
        {}
      );
    });
}

function parseBoolean(value) {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    normalized === ""
  ) {
    return true;
  }

  return ![
    "false",
    "0",
    "non",
    "no",
    "inactive",
    "inactif",
  ].includes(normalized);
}

async function importOrganizations() {
  if (!state.isAdmin) {
    return;
  }

  const input =
    getElement(
      "organizationsCsvFile"
    );

  const message =
    getElement(
      "organizationsImportMessage"
    );

  const button =
    getElement(
      "importOrganizationsButton"
    );

  hideMessage(message);

  try {
    const file =
      input?.files?.[0];

    if (!file) {
      throw new Error(
        "Veuillez sélectionner un fichier CSV."
      );
    }

    setButtonLoading(
      button,
      true,
      "Importation..."
    );

    const text =
      await file.text();

    const records =
      parseCsv(text);

    const payload =
      records.map(
        (record, index) => {
          const name =
            record.name?.trim();

          if (!name) {
            throw new Error(
              `Ligne ${index + 2} : la colonne name est obligatoire.`
            );
          }

          return {
            name,

            acronym:
              record.acronym
                ?.trim() ||
              null,

            slug:
              slugify(name),

            is_active:
              parseBoolean(
                record.is_active
              ),
          };
        }
      );

    const {
      error,
    } = await supabase
      .from("organizations")
      .upsert(
        payload,
        {
          onConflict: "name",
        }
      );

    if (error) {
      throw error;
    }

    await writeAdminLog(
      "import",
      "organizations",
      null,
      {
        rows:
          payload.length,
      }
    );

    showMessage(
      message,
      `${payload.length} organisation(s) importée(s) ou mise(s) à jour.`,
      "success"
    );

    input.value = "";

    await Promise.all([
      loadAdminOrganizations(),
      loadPublicOrganizations(),
    ]);
  } catch (error) {
    showMessage(
      message,
      error.message,
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

async function importAlerts() {
  if (!state.isAdmin) {
    return;
  }

  const input =
    getElement("alertsCsvFile");

  const message =
    getElement(
      "alertsImportMessage"
    );

  const button =
    getElement(
      "importAlertsButton"
    );

  hideMessage(message);

  try {
    const file =
      input?.files?.[0];

    if (!file) {
      throw new Error(
        "Veuillez sélectionner un fichier CSV."
      );
    }

    setButtonLoading(
      button,
      true,
      "Importation..."
    );

    const text =
      await file.text();

    const records =
      parseCsv(text);

    let importedCount = 0;

    for (
      let index = 0;
      index < records.length;
      index += 1
    ) {
      const record =
        records[index];

      const organizationName =
        record.organization_name
          ?.trim();

      const alertCode =
        record.alert_code
          ?.trim();

      const sector =
        record.sector
          ?.trim();

      const commune =
        record.commune
          ?.trim();

      if (
        !organizationName ||
        !alertCode ||
        !sector ||
        !commune
      ) {
        throw new Error(
          `Ligne ${index + 2} : organization_name, alert_code, sector et commune sont obligatoires.`
        );
      }

      const {
        data: organization,
        error:
          organizationError,
      } = await supabase
        .from("organizations")
        .select("id")
        .eq(
          "name",
          organizationName
        )
        .maybeSingle();

      if (
        organizationError
      ) {
        throw organizationError;
      }

      if (!organization) {
        throw new Error(
          `Ligne ${index + 2} : organisation introuvable — ${organizationName}.`
        );
      }

      const isActive =
        parseBoolean(
          record.is_active
        );

      const {
        data: alert,
        error: alertError,
      } = await supabase
        .from("alerts")
        .upsert(
          {
            alert_code:
              alertCode,

            sector,

            commune,

            province:
              record.province
                ?.trim() ||
              null,

            region:
              record.region
                ?.trim() ||
              null,

            is_active:
              isActive,
          },
          {
            onConflict:
              "alert_code",
          }
        )
        .select("id")
        .single();

      if (alertError) {
        throw alertError;
      }

      const {
        error:
          associationError,
      } = await supabase
        .from(
          "organization_alerts"
        )
        .upsert(
          {
            organization_id:
              organization.id,

            alert_id:
              alert.id,

            is_active:
              isActive,
          },
          {
            onConflict:
              "organization_id,alert_id",
          }
        );

      if (
        associationError
      ) {
        throw associationError;
      }

      importedCount += 1;
    }

    await writeAdminLog(
      "import",
      "alerts",
      null,
      {
        rows:
          importedCount,
      }
    );

    showMessage(
      message,
      `${importedCount} alerte(s) importée(s) ou mise(s) à jour.`,
      "success"
    );

    input.value = "";

    await Promise.all([
      loadAdminAlerts(),
      loadPublicAlertOptions(),
    ]);
  } catch (error) {
    showMessage(
      message,
      error.message,
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

/* ==========================================================
   17. ADMINISTRATION DES DOCUMENTS
   ========================================================== */

function renderAdminDocuments() {
  const table =
    getElement(
      "adminDocumentsTable"
    );

  if (!table) {
    return;
  }

  if (
    state.documents.length === 0
  ) {
    table.innerHTML = `
      <tr>
        <td colspan="6">
          Aucun document enregistré.
        </td>
      </tr>
    `;

    return;
  }

  table.innerHTML =
    state.documents
      .map((documentItem) => `
        <tr>
          <td>
            ${escapeHtml(
              documentItem.file_name
            )}
          </td>

          <td>
            ${escapeHtml(
              documentItem
                .organization_name
            )}
          </td>

          <td>
            ${escapeHtml(
              documentItem.alert_code
            )}
          </td>

          <td>
            ${escapeHtml(
              documentItem.commune
            )}
          </td>

          <td>
            ${formatDate(
              documentItem.created_at
            )}
          </td>

          <td>
            <div class="table-actions">
              <button
                type="button"
                class="table-action"
                data-replace-document="${documentItem.id}"
              >
                Remplacer
              </button>

              <button
                type="button"
                class="table-action table-action-danger"
                data-delete-document="${documentItem.id}"
              >
                Supprimer
              </button>
            </div>
          </td>
        </tr>
      `)
      .join("");

  table
    .querySelectorAll(
      "[data-replace-document]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openReplaceModal(
            button.dataset
              .replaceDocument
          );
        }
      );
    });

  table
    .querySelectorAll(
      "[data-delete-document]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deleteDocument(
            button.dataset
              .deleteDocument
          );
        }
      );
    });
}

function openReplaceModal(
  documentId
) {
  getElement(
    "replaceDocumentId"
  ).value =
    documentId;

  getElement(
    "replacementFile"
  ).value = "";

  hideMessage(
    getElement("replaceMessage")
  );

  const modal =
    getElement("replaceModal");

  modal?.classList.remove(
    "hidden"
  );

  modal?.setAttribute(
    "aria-hidden",
    "false"
  );
}

function closeReplaceModal() {
  const modal =
    getElement("replaceModal");

  modal?.classList.add(
    "hidden"
  );

  modal?.setAttribute(
    "aria-hidden",
    "true"
  );

  getElement(
    "replaceDocumentForm"
  )?.reset();

  hideMessage(
    getElement("replaceMessage")
  );
}

async function replaceDocument(
  event
) {
  event.preventDefault();

  if (!state.isAdmin) {
    return;
  }

  const submitButton =
    event.submitter;

  const message =
    getElement("replaceMessage");

  hideMessage(message);

  let newStoragePath = null;

  try {
    const documentId =
      getElement(
        "replaceDocumentId"
      )?.value;

    const file =
      getElement(
        "replacementFile"
      )?.files?.[0];

    validatePdf(file);

    const currentDocument =
      state.documents.find(
        (item) =>
          item.id === documentId
      );

    if (!currentDocument) {
      throw new Error(
        "Document introuvable."
      );
    }

    setButtonLoading(
      submitButton,
      true,
      "Remplacement..."
    );

    newStoragePath = [
      slugify(
        currentDocument
          .organization_name
      ),

      slugify(
        currentDocument
          .alert_code
      ),

      `${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`,
    ].join("/");

    const {
      error: uploadError,
    } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
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
      throw uploadError;
    }

    const {
      error: updateError,
    } = await supabase
      .from("documents")
      .update({
        file_name: file.name,
        storage_path:
          newStoragePath,
        file_size: file.size,
        mime_type:
          "application/pdf",
      })
      .eq("id", documentId);

    if (updateError) {
      await supabase.storage
        .from(
          CONFIG.STORAGE_BUCKET
        )
        .remove([
          newStoragePath,
        ]);

      newStoragePath = null;

      throw updateError;
    }

    const {
      error: removeError,
    } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .remove([
        currentDocument
          .storage_path,
      ]);

    if (removeError) {
      console.warn(
        "Ancien fichier non supprimé :",
        removeError.message
      );
    }

    await writeAdminLog(
      "replace",
      "document",
      documentId,
      {
        previous_file:
          currentDocument.file_name,

        previous_path:
          currentDocument
            .storage_path,

        new_file:
          file.name,

        new_path:
          newStoragePath,
      }
    );

    showMessage(
      message,
      "Le document a été remplacé avec succès.",
      "success"
    );

    await loadDocuments();

    window.setTimeout(
      closeReplaceModal,
      1000
    );
  } catch (error) {
    showMessage(
      message,
      error.message ||
        "Remplacement impossible.",
      "error"
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

async function deleteDocument(
  documentId
) {
  if (!state.isAdmin) {
    return;
  }

  const documentItem =
    state.documents.find(
      (item) =>
        item.id === documentId
    );

  if (!documentItem) {
    window.alert(
      "Document introuvable."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Supprimer définitivement le document « ${documentItem.file_name} » ?`
    );

  if (!confirmed) {
    return;
  }

  try {
    const {
      error: storageError,
    } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .remove([
        documentItem
          .storage_path,
      ]);

    if (storageError) {
      throw new Error(
        `Suppression du fichier impossible : ${storageError.message}`
      );
    }

    const {
      error: databaseError,
    } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (databaseError) {
      throw new Error(
        `Suppression de l’enregistrement impossible : ${databaseError.message}`
      );
    }

    await writeAdminLog(
      "delete",
      "document",
      documentId,
      {
        file_name:
          documentItem.file_name,

        storage_path:
          documentItem
            .storage_path,

        organization:
          documentItem
            .organization_name,

        alert_code:
          documentItem.alert_code,
      }
    );

    await loadDocuments();
  } catch (error) {
    window.alert(
      error.message ||
        "Suppression impossible."
    );
  }
}

/* ==========================================================
   18. JOURNAL ADMINISTRATIF
   ========================================================== */

async function writeAdminLog(
  action,
  entityType,
  entityId,
  details = {}
) {
  if (
    !state.isAdmin ||
    !state.session?.user?.id
  ) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("admin_logs")
    .insert({
      admin_id:
        state.session.user.id,

      action,

      entity_type:
        entityType,

      entity_id:
        entityId || null,

      details,
    });

  if (error) {
    console.warn(
      "Journal administratif non enregistré :",
      error.message
    );
  }
}

/* ==========================================================
   19. PANNEAUX D'ADMINISTRATION
   ========================================================== */

function showAdminPanel(
  panelName
) {
  document
    .querySelectorAll(
      ".admin-panel"
    )
    .forEach((panel) => {
      panel.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".admin-tab"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset
          .adminPanel ===
          panelName
      );
    });

  const formattedName =
    panelName.charAt(0)
      .toUpperCase() +
    panelName.slice(1);

  getElement(
    `admin${formattedName}Panel`
  )?.classList.add("active");
}

async function loadAdminData() {
  if (!state.isAdmin) {
    return;
  }

  try {
    await Promise.all([
      loadAdminOrganizations(),
      loadAdminAlerts(),
      loadDocuments(),
    ]);
  } catch (error) {
    console.error(
      "Erreur administration :",
      error
    );

    window.alert(
      error.message ||
        "Impossible de charger les données administratives."
    );
  }
}

/* ==========================================================
   20. GESTION DES MODALES
   ========================================================== */

function closeAllModals() {
  closeLoginModal();
  closeReplaceModal();
}

/* ==========================================================
   21. INITIALISATION DES EVENEMENTS
   ========================================================== */

function initializeEvents() {
  initializeNavigation();

  getElement("loginButton")
    ?.addEventListener(
      "click",
      openLoginModal
    );

  getElement(
    "closeLoginModal"
  )?.addEventListener(
    "click",
    closeLoginModal
  );

  getElement("loginForm")
    ?.addEventListener(
      "submit",
      handleAdminLogin
    );

  getElement("logoutButton")
    ?.addEventListener(
      "click",
      handleLogout
    );

  getElement(
    "publishOrganization"
  )?.addEventListener(
    "change",
    handlePublishOrganizationChange
  );

  getElement("publishAlert")
    ?.addEventListener(
      "change",
      handlePublishAlertChange
    );

  getElement("publishFile")
    ?.addEventListener(
      "change",
      handlePublishFileChange
    );

  getElement("publishForm")
    ?.addEventListener(
      "submit",
      handlePublicPublication
    );

  getElement("documentSearch")
    ?.addEventListener(
      "input",
      renderDocuments
    );

  [
    "filterOrganization",
    "filterAlert",
    "filterSector",
    "filterCommune",
  ].forEach((id) => {
    getElement(id)
      ?.addEventListener(
        "change",
        renderDocuments
      );
  });

  getElement(
    "resetFiltersButton"
  )?.addEventListener(
    "click",
    resetDocumentFilters
  );

  document
    .querySelectorAll(
      ".admin-tab"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          showAdminPanel(
            button.dataset
              .adminPanel
          );
        }
      );
    });

  getElement(
    "organizationForm"
  )?.addEventListener(
    "submit",
    saveOrganization
  );

  getElement(
    "resetOrganizationForm"
  )?.addEventListener(
    "click",
    resetOrganizationForm
  );

  getElement("alertForm")
    ?.addEventListener(
      "submit",
      saveAlert
    );

  getElement(
    "resetAlertForm"
  )?.addEventListener(
    "click",
    resetAlertForm
  );

  getElement(
    "importOrganizationsButton"
  )?.addEventListener(
    "click",
    importOrganizations
  );

  getElement(
    "importAlertsButton"
  )?.addEventListener(
    "click",
    importAlerts
  );

  getElement(
    "replaceDocumentForm"
  )?.addEventListener(
    "submit",
    replaceDocument
  );

  getElement(
    "closeReplaceModal"
  )?.addEventListener(
    "click",
    closeReplaceModal
  );

  document
    .querySelectorAll(
      ".modal-backdrop"
    )
    .forEach((backdrop) => {
      backdrop.addEventListener(
        "click",
        closeAllModals
      );
    });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeAllModals();
      }
    }
  );
}

/* ==========================================================
   22. INITIALISATION GENERALE
   ========================================================== */

async function initializeApplication() {
  initializeEvents();

  try {
    await initializeAuthentication();

    await Promise.all([
      loadPublicOrganizations(),
      loadPublicAlertOptions(),
      loadDocuments(),
    ]);
  } catch (error) {
    console.error(
      "Erreur initialisation :",
      error
    );

    window.alert(
      `Erreur d’initialisation du portail : ${error.message}`
    );
  }
}

initializeApplication();
