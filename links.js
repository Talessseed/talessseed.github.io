document.addEventListener("DOMContentLoaded", function () {

    var anchorElements = document.getElementsByTagName('a');

    // Loop through each <a> element
    for (var i = 0; i < anchorElements.length; i++) {
        var anchor = anchorElements[i];
        var textContent = anchor.textContent; // Get the text content of the <a> element
        anchor.setAttribute('data-content', textContent); // Set the text content as the value of the data-content attribute
    }
});