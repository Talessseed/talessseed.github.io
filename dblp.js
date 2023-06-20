// Fetch XML data from the URL
fetch("https://dblp.org/pid/291/6764.xml")
    .then(response => response.text())
    .then(data => {
        // Create an XML parser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, "application/xml");

        // Extract the list of papers from the XML data
        const papers = Array.from(xmlDoc.getElementsByTagName("r"));

        // Get the HTML container to hold the papers
        const container = document.getElementById("publication_list");

        // Group papers by year
        const papersByYear = {};

        papers.forEach(paper => {
            const year = paper.getElementsByTagName("year")[0]?.textContent;

            if (year) {
                if (!papersByYear.hasOwnProperty(year)) {
                    papersByYear[year] = [];
                }

                papersByYear[year].push(paper);
            }
        });

        // Create an HTML container for each year
        Object.keys(papersByYear).reverse().forEach(year => {
            const yearContainer = document.createElement("div");
            const yearTitle = document.createElement("h2");
            yearTitle.textContent = year;
            yearContainer.appendChild(yearTitle);

            // Create an unordered list for the papers
            const paperList = document.createElement("ul");

            // Populate the paper list with list items
            papersByYear[year].forEach(paper => {
                const paperTitle = paper.getElementsByTagName("title")[0]?.textContent;
                const authors = Array.from(paper.getElementsByTagName("author")).map(author => ({
                    name: removeNumber(author.textContent),
                    url: `https://dblp.org/pid/${author.getAttribute("pid")}.html`
                }));
                const venue = paper.getElementsByTagName("journal")[0]?.textContent || paper.getElementsByTagName("booktitle")[0]?.textContent;
                const url = paper.getElementsByTagName("ee")[0]?.textContent;
                paperType = "preprint";
                const paperFirstChild = get_firstchild(paper);

                if (paperFirstChild.getAttribute("publtype") != "informal") {
                    paperType = paperFirstChild.getAttribute("key");
                    // extract paper type
                    paperType = paperType.substring(0, paperType.indexOf('/'));
                }

                const listItem = document.createElement("li");
                listItem.classList.add(paperType); // Set the class of the list item to the publication type

                // Display the authors' names with links to DBLP page
                const authorsSpan = document.createElement("span");

                authors.forEach(author => {
                    const authorLink = document.createElement("a");
                    authorLink.href = author.url;
                    authorLink.textContent = author.name.replace(/\d+$/, "").trimEnd(); // Remove number at the end and trailing spaces
                    // authorLink.target = "_blank"; // Open link in a new tab
                    authorLink.rel = "noopener noreferrer"; // Security best practices
                    authorLink.setAttribute('data-content', authorLink.textContent);
                    authorsSpan.appendChild(authorLink);
                    authorsSpan.appendChild(document.createTextNode(", "));
                });

                // Remove the trailing comma
                if (authorsSpan.lastChild) {
                    authorsSpan.removeChild(authorsSpan.lastChild);
                }

                listItem.appendChild(authorsSpan);

                const titleSpan = document.createElement("span");
                titleSpan.innerHTML = `. <b>${paperTitle}</b> `; // Make the paper title bold
                listItem.appendChild(titleSpan);

                // Add the paper information to the list item
                if (venue) {
                    listItem.innerHTML += `<i>${venue}</i>`; // Make the venue italic
                }
                if (url) {
                    listItem.innerHTML += `<a data-content="[URL]" href="${url}"> [URL]</a>`;
                }

                // Append the list item to the paper list
                paperList.appendChild(listItem);
            });

            // Append the paper list to the year container
            yearContainer.appendChild(paperList);

            // Append the year container to the main container
            container.appendChild(yearContainer);
        });
    })
    .catch(error => console.log(error));

// Function to remove the number at the end of an author's name and trailing spaces
function removeNumber(authorName) {
    const regex = /\d+$/;
    return authorName.replace(regex, "").trimEnd();
}

function get_firstchild(n) {
    var x = n.firstChild;
    while (x.nodeType != 1) {
        x = x.nextSibling;
    }
    return x;
}