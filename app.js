async function loadHTMLComponents() {
  // Find all elements with a 'data-include' attribute
  const elements = Array.from(document.querySelectorAll("[data-include]"));

  // Fetch all HTML components in parallel for maximum speed
  const loadPromises = elements.map(async (el) => {
    const file = el.getAttribute("data-include");
    try {
      const response = await fetch(file);
      if (response.ok) {
        const html = await response.text();
        // outerHTML completely replaces the placeholder <div> so it doesn't break CSS grids
        el.outerHTML = html;
      }
    } catch (error) {
      console.error(`Error loading component: ${file}`, error);
    }
  });

  // Wait for all fetches to finish
  await Promise.all(loadPromises);

  // Smoothly fade the whole UI in
  document.body.classList.remove("opacity-0");
}

// Run the loader as soon as the DOM tree is ready
document.addEventListener("DOMContentLoaded", loadHTMLComponents);
document.addEventListener("alpine:init", () => {
  const createSvgUrl = (svgString) => {
    if (!svgString) return "";
    const colorizedSvg = svgString.replace(/currentColor/g, "#D6BD98");
    return (
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(colorizedSvg)
    );
  };

  Alpine.data("newTabApp", () => ({
    groups: [],

    // UI Visibility States
    isFabMenuOpen: false,
    isLinkModalOpen: false,
    isGroupModalOpen: false,
    backgroundImage: "./background.jpg",

    // Form Data
    newGroupName: "",
    newLink: {
      groupName: "", // This will now bind to the <select> element
      name: "",
      url: "",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>',
    },

    init() {
      chrome.storage.local.get(
        ["dashboardGroups", "customBackground"],
        (result) => {
          if (result.customBackground) {
            this.backgroundImage = result.customBackground;
          }
          if (result.dashboardGroups && result.dashboardGroups.length > 0) {
            this.groups = result.dashboardGroups.map((group) => ({
              ...group,
              links: group.links.map((link) => {
                const iconSvg = link.icon || this.newLink.icon;
                return {
                  ...link,
                  icon: iconSvg,
                  iconUrl: createSvgUrl(iconSvg),
                };
              }),
            }));

            // Set the default dropdown selection to the first group
            this.newLink.groupName = this.groups[0].groupName;
          } else {
            fetch("./links.json")
              .then((response) => response.json())
              .then((data) => {
                const processedData = data.map((group) => ({
                  ...group,
                  links: group.links.map((link) => ({
                    ...link,
                    iconUrl: createSvgUrl(link.icon),
                  })),
                }));

                this.groups = processedData;
                if (this.groups.length > 0)
                  this.newLink.groupName = this.groups[0].groupName;
                chrome.storage.local.set({ dashboardGroups: processedData });
              })
              .catch((error) => console.error("Error loading links:", error));
          }
        },
      );
    },

    // --- Action Helpers ---
    openAddGroupModal() {
      this.isFabMenuOpen = false;
      this.isGroupModalOpen = true;
    },

    openAddLinkModal() {
      this.isFabMenuOpen = false;
      if (this.groups.length === 0) {
        alert("Please create a Group first!");
        return;
      }
      this.isLinkModalOpen = true;
    },
    // NEW: Open Settings Helper
    openSettingsModal() {
      this.isFabMenuOpen = false;
      this.isSettingsModalOpen = true;
    },
    // NEW: Handle Background Upload
    handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();

      // When the file is done reading...
      reader.onload = (e) => {
        const base64Image = e.target.result; // The image as a string

        // 1. Update the UI instantly
        this.backgroundImage = base64Image;

        // 2. Save it to Chrome Storage so it survives reloads
        chrome.storage.local.set({ customBackground: base64Image });
      };

      // Read the file as a Data URL
      reader.readAsDataURL(file);
    },

    // NEW: Reset Background to Default
    resetBackground() {
      this.backgroundImage = "./background.jpg";
      chrome.storage.local.remove("customBackground");
    },
    // --- Save Logic ---
    saveGroup() {
      if (!this.newGroupName.trim()) return;

      // Check if group already exists to prevent duplicates
      const exists = this.groups.some(
        (g) =>
          g.groupName.toLowerCase() === this.newGroupName.trim().toLowerCase(),
      );

      if (!exists) {
        // Add new empty group to the array
        this.groups.push({ groupName: this.newGroupName.trim(), links: [] });

        const cleanData = JSON.parse(JSON.stringify(this.groups));

        chrome.storage.local.set({ dashboardGroups: cleanData }, () => {
          this.isGroupModalOpen = false;
          // Set dropdown to the newly created group
          this.newLink.groupName = this.newGroupName.trim();
          this.newGroupName = "";
        });
      } else {
        alert("A group with this name already exists.");
      }
    },

    saveLink() {
      if (!this.newLink.name || !this.newLink.url || !this.newLink.groupName)
        return;

      let finalUrl = this.newLink.url.startsWith("http")
        ? this.newLink.url
        : `https://${this.newLink.url}`;
      const iconSvg = this.newLink.icon;

      const newEntry = {
        name: this.newLink.name,
        url: finalUrl,
        style:
          "text-accent/80 hover:bg-secondary/80 hover:text-accent border-tertiary/40",
        icon: iconSvg,
        iconUrl: createSvgUrl(iconSvg),
      };

      // Find the group chosen in the dropdown and push the link into it
      let groupIndex = this.groups.findIndex(
        (g) => g.groupName === this.newLink.groupName,
      );

      if (groupIndex !== -1) {
        this.groups[groupIndex].links.push(newEntry);
        const cleanData = JSON.parse(JSON.stringify(this.groups));
        chrome.storage.local.set({ dashboardGroups: cleanData }, () => {
          this.isLinkModalOpen = false;
          this.newLink.name = "";
          this.newLink.url = "";
          // Notice we do NOT clear this.newLink.groupName here, so the user can easily add multiple links to the same group!
        });
      }
    },
    // --- NEW: Download JSON Logic ---
    downloadJson() {
      // 1. Create a clean copy without the generated 'iconUrl' to match original links.json
      const cleanData = this.groups.map((group) => ({
        groupName: group.groupName,
        links: group.links.map((link) => ({
          name: link.name,
          url: link.url,
          style: link.style,
          icon: link.icon,
        })),
      }));

      // 2. Convert to a formatted JSON string
      const jsonString = JSON.stringify(cleanData, null, 2);

      // 3. Create a Blob (a file-like object of immutable, raw data)
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // 4. Create a temporary anchor tag to trigger the download
      const a = document.createElement("a");
      a.href = url;
      a.download = "links.json"; // Name of the downloaded file
      document.body.appendChild(a);
      a.click();

      // 5. Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Close the FAB menu
      this.isFabMenuOpen = false;
    },
  }));
});
