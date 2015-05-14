define(function (require, exports, module) {
    "use strict";

    // Dependencies
    var blobStream = require("thirdparty/blob-stream");
    var Dialogs = require("Dialogs");
    var ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
    var PDFKit = require("thirdparty/pdfkit");
    var Nls = require("i18n!nls/strings");
    var NodeDomain = brackets.getModule("utils/NodeDomain");

    /**
     * @const
     * @private
     * @type {string}
     */
    var _BLOB_TYPE = "application/pdf";

    /**
     * @private
     * @type {NodeDomain}
     */
    var _fs = new NodeDomain(
        "pdfexport.FileSystemDomain",
        ExtensionUtils.getModulePath(module, "FileSystemDomain.js")
    );

    /**
     * @private
     * @type {string}
     */
    var _PDF_FONTFACE = "Courier";

    /**
     * @private
     * @param {!string} pathname
     * @param {!blob} blob
     * @return {!promise}
     */
    function _writeFile(pathname, blob) {
        var deferred = new $.Deferred();
        var reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onloadend = function onLoadEnd() {
            _fs.exec("write", pathname, reader.result)
                .fail(function(err) {
                    Dialogs.showErrorDialog(
                        Nls.ERROR_PDFKIT_TITLE,
                        Nls.ERROR_WRITE_MSG,
                        err.errno
                    );
            });
        };

        return deferred.promise();
    }

    /**
     * @private
     * @param {{fontSize: number, pathname: string, text: string, margins: object, includepagenumbers: boolean, syntaxHighlight: boolean}} options
     * @return {!promise}
     */
    function create(options) {
        var PDFKitOptions = {
            margins: {
                bottom: options.margins.top,
                left: options.margins.left,
                right: options.margins.right,
                top: options.margins.top
            }
        };
        var deferred = new $.Deferred();
        var pdf = new PDFKit(PDFKitOptions);
        var stream = pdf.pipe(blobStream());

        pdf.font(_PDF_FONTFACE, options.fontSize);
        
        if(options.includePageNumbers) {
            var lines = (options.text).split("\n");
            var pageNumber = 1;
            var maxNumberOfLinesInPage = Math.floor((pdf.page.height - options.margins.bottom - options.margins.top) / pdf.currentLineHeight(true));
            if (options.syntaxHighlight) {
                var allowedNumberOfLinesInPage = maxNumberOfLinesInPage - (Math.round(options.fontSize / 3));
            } else {
                var allowedNumberOfLinesInPage = maxNumberOfLinesInPage - 2;
            }
            var allowedNumberOfLinesInThisPage = allowedNumberOfLinesInPage;
            var footerX = options.margins.left + 1;
            var footerY = (pdf.page.height - options.margins.bottom - pdf.currentLineHeight(true));
            var lineTheme = [];
            var lineText = "";
            var wordTheme = [];
            var maxWidthOfPage = pdf.page.width - options.margins.left - options.margins.right;
            var spaceTaken = 0;
            var _ = brackets.getModule("thirdparty/lodash");
            console.log(allowedNumberOfLinesInThisPage);
            for (var i = 0; i < lines.length; i++) {
                if (options.syntaxHighlight) {
                    lineTheme = options.syntaxText[i];
                    _.each(lineTheme, function(definition) {
                        lineText += definition.text;
                        wordTheme = definition;
                        pdf.fillColor(definition["style"]);
                        pdf.text(definition["text"], {
                            continued: true
                        });
                    });
                    pdf.fillColor("#000000");
                    pdf.text(" ", {
                        continued: false
                    });
                    /*if (i !== allowedNumberOfLinesInThisPage) {
                        pdf.text("\n", {
                            continued: false
                        });
                    }*/
                    if (options.syntaxHighlight) {
                        spaceTaken = (pdf.widthOfString(lineText) / maxWidthOfPage);
                        if (spaceTaken > 1) {
                            allowedNumberOfLinesInThisPage -= (Math.floor(spaceTaken));
                        }
                    }
                    lineText = "";
                    if(i === allowedNumberOfLinesInThisPage) {
                        console.log(i);
                        console.log("Page " + pageNumber);
                        pdf.text("Page " + pageNumber, footerX, footerY, {
                            align: "center"
                        });
                        pdf.addPage();
                        pageNumber++;
                        allowedNumberOfLinesInThisPage = (pageNumber * allowedNumberOfLinesInPage);
                        console.log("Allowed Number on next page: "+allowedNumberOfLinesInThisPage);
                    }
                    //if(pageNumber === 15) {
                    //    break;
                    //}
                    if(i === (lines.length - 1)){
                        pdf.text("Page " + pageNumber, footerX, footerY, {
                            align: "center"
                        });
                    }
                } else {
                    pdf.text(lines[i] + "\n");
                    if(i === allowedNumberOfLinesInThisPage) {
                        console.log(i);
                        pdf.text("Page " + pageNumber, footerX, footerY, {
                            align: "center"
                        });
                        pdf.addPage();
                        pageNumber++;
                        allowedNumberOfLinesInThisPage = (pageNumber * allowedNumberOfLinesInPage);
                    }
                    //if(pageNumber === 15) {
                    //    break;
                    //}
                    if(i === (lines.length - 1)){
                        pdf.text("Page " + pageNumber, footerX, footerY, {
                            align: "center"
                        });
                    }
                }
            }
        }else{
           if (options.syntaxHighlight) {
                //
           } else {
                pdf.text(options.text);
           }
        }
        
        pdf.save()
           .end();

        /**
         * @TODO Research PDFKit errors in order to provide improved error messages
         */
        stream.on("error", function _handleError(err) {
            deferred.reject(err);
        });

        stream.on("finish", function _handlePDFCreation() {
            var blob = stream.toBlob({ type: _BLOB_TYPE });

            _writeFile(options.pathname, blob)
                .fail(deferred.reject.bind(deferred))
                .then(deferred.resolve.bind(deferred));
        });

        return deferred.promise();
    }

    // Define public API
    exports.create = create;
});
