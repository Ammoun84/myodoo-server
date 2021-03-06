(function () {
    'use strict';

    var website = openerp.website;
    var _t = openerp._t;

    website.add_template_file('/website/static/src/xml/website_files.editor.xml?'+Math.random());

    var ACTUALTAB = 0;
    website.editor.LinkDialog.include({
        start: function(){
            var self = this;
            var last;
            this.$('#link-file').select2({
                minimumInputLength: 1,
                placeholder: _t("File name"),
                query: function (q) {
                    if (q.term == last) return;
                    last = q.term;
                    $.when(
                        self.fetch_files(q.term)
                    ).then(function (results) {
                        var rs = _.map(results, function (r) {
                            return { id: r.website_file_url, text: r.datas_fname};
                        });
                        q.callback({
                            more: false,
                            results: rs
                        });
                    }, function () {
                        q.callback({more: false, results: []});
                    });
                },
            });
            return this._super();
        },
        
        fetch_files: function (term) {
            return this.call('search_files', [null, term], {
                limit: 9,
                context: website.get_context(),
            });
        },

    })

    website.editor.MediaDialog.include({
        start: function () {
            var self = this;
            this.fileDialog = new website.editor.FileDialog(this, this.editor, this.media);
            this.fileDialog.appendTo(this.$("#editor-media-file"));

            $('a[data-toggle="tab"]').on('shown.bs.tab', function (event) {
                if ($(event.target).is('[href="#editor-media-file"]')) {
                    self.active = self.fileDialog;
                    self.$('li.search, li.previous, li.next').removeClass("hidden");
                }
            });
            if (this.media) {
                if (this.media.$.nodeName === "A") {
                    this.$('[href="#editor-media-file"]').tab('show');
                }
            }
            return this._super();
        },
        
        save: function(){
            var self = this;
            if (self.media) {
                if (this.active !== this.fileDialog) {
                    this.fileDialog.clear();
                }
            }
            return this._super();
        }
    })

    var FILES_PER_PAGE = 80;			// max count of records on one page in listview
    var SORT_TYPE = "asc";				// sorting order of records on one page in listview
    var SORT_TYPE_DATE = "None";
    website.editor.FileDialog = website.editor.Media.extend({	
        template: 'website.editor.dialog.file',
        events: _.extend({}, website.editor.Dialog.prototype.events, {
            'click button.filepicker': function () {
                var filepicker = this.$('input[type=file]');
                if (!_.isEmpty(filepicker)){
                    filepicker[0].click();
                }
            },
            'change input[type=file]': 'file_selection',
            'submit form': 'form_submit',
            'click .existing-attachments-files tr.file': 'select_existing',
            'click .existing-attachment-file-remove': 'try_remove',
            'click .sortRecords': 'sort_records',
            'click .sortRecordsByDate': 'sort_records_date',
        }),
        sort_records: function(){        	
        	this.SORT_TYPE_DATE = "None";			// deactivate sorting by name - we'll support only ONE sorting
        	
        	if (this.SORT_TYPE == "desc")
        		this.SORT_TYPE = "asc";
        	else
        		this.SORT_TYPE = "desc";
        	
        	this.display_attachments();        	
        },        
        sort_records_date: function(){
        	this.SORT_TYPE = "None";			// deactivate sorting by name - we'll support only ONE sorting
        	if (this.SORT_TYPE_DATE == "desc")
        		this.SORT_TYPE_DATE = "asc";
        	else
        		this.SORT_TYPE_DATE = "desc";
        	
        	this.display_attachments();        	
        },
        init: function (parent, editor, media) {
            this.page = 0;
            this._super(parent, editor, media);
            this.SORT_TYPE = "None";				// to be able to support default initial sorting, use this as default
            this.SORT_TYPE_DATE = "None";
        },        
        start: function () {        	        	
            var self = this;
            var res = this._super();        
            var o = { url: null, file_name: null };
            
            // avoid typos, prevent addition of new properties to the object
            Object.preventExtensions(o);
            this.trigger('start', o);

            // EQUITANIA
            this.parent.$(".eq_tab").click(function (e) {
            	ACTUALTAB = $(this).index();            	
            	self.display_attachments();
            });
                                    
            // register click on pager handler
            this.parent.$(".pager > li").click(function (e) {            	
            	if (ACTUALTAB == 3){
            		e.preventDefault();	
            		var $target = $(e.currentTarget);
                    if ($target.hasClass('disabled')) {
                        return;
                    }
                    self.page += $target.hasClass('previous') ? -1 : 1;
                    self.display_attachments();
            	}        		
            });

            this.set_file(o.url, o.file_name);

            return res;
        },
        
        save: function () {
            if (!this.link) {
                this.link = this.$(".existing-attachments-files img:first").attr('src');
            }
            this.trigger('save', {
                url: this.link
            });
            this.media.renameNode("a");
            this.media.$.innerHTML = this.file_name
            $(this.media).attr('href', this.link);
            return this._super();
        },
        
        clear: function () {
            this.media.$.className = this.media.$.className.replace(/(^|\s)(img(\s|$)|img-[^\s]*)/g, ' ');
        },
        
        cancel: function () {
            this.trigger('cancel');
        },

        change_input: function (e) {
            var $input = $(e.target);
            var $button = $input.parent().find("button");
            if ($input.val() === "") {
                $button.addClass("btn-default").removeClass("btn-primary");
            } else {
                $button.removeClass("btn-default").addClass("btn-primary");
            }
        },

        search: function (needle) {
            var self = this;
            this.fetch_existing(needle).then(function () {
                self.selected_existing(self.$('input.url').val());
            });
        },

        set_file: function (file_name, url, error) {
            var self = this;
            if (url) this.link = url;
            if (file_name) this.file_name = file_name;
            this.$('input.url').val('');
            this.fetch_existing().then(function () {
                self.selected_existing(url);
            });
        },

        form_submit: function (event) {
            var self = this;
            var $form = this.$('form[action="/website/attach_file"]');
            if (!$form.find('input[name="upload"]').val().length) {
                return false;
                // url is not used
                /*
                var url = $form.find('input[name="url"]').val();
                if (this.selected_existing(url).size()) {
                    event.preventDefault();
                    return false;
                }
                 */
            }
            var callback = _.uniqueId('func_');
            this.$('input[name=func]').val(callback);
            window[callback] = function (file_name, url, error) {
                delete window[callback];
                self.file_selected(file_name, url, error);
            };
        },
        file_selection: function () {
            this.$el.addClass('nosave');
            this.$('form').removeClass('has-error').find('.help-block').empty();
            this.$('button.filepicker').removeClass('btn-danger btn-success');
            this.$('form').submit();
        },
        file_selected: function(file_name, url, error) {
            var $button = this.$('button.filepicker');
            if (!error) {
                $button.addClass('btn-success');
            } else {
                url = null;
                this.$('form').addClass('has-error')
                    .find('.help-block').text(error);
                $button.addClass('btn-danger');
            }
            this.set_file(file_name, url, error);
            // auto save and close popup
            this.parent.save();
        },

        fetch_existing: function (needle) {
            var domain = [['website_file', '=', true]];
            if (needle && needle.length) {
                domain.push('|', ['datas_fname', 'ilike', needle], ['name', 'ilike', needle]);
            }
            return openerp.jsonRpc('/web/dataset/call_kw', 'call', {
                model: 'ir.attachment',
                method: 'search_read',
                args: [],
                kwargs: {
                    fields: ['name', 'write_date', 'datas_fname', 'website_file_url', 'website_file_count', 'file_size'],
                    domain: domain,
                    order: 'write_date desc',
                    context: website.get_context(),
                }
            }).then(this.proxy('fetched_existing'));
        },
        
        fetched_existing: function (records) {
            this.records = records;
            this.display_attachments();
        },                
        
        display_attachments: function () {        	        
        	if (ACTUALTAB == 3){
        		//console.log("IVAN - display_attachments");
        		this.$('.help-block').empty();
                var per_screen = FILES_PER_PAGE;            
                var from = this.page * per_screen;
                var records = this.records;                
                var cur_records = _(records).chain().slice(from, from + per_screen).value();
                
                // prepare sorterd result - we'll support only ONE kind of sort at once, no combinations
	            if (this.SORT_TYPE != "None"){																		     // sort result list. if None is selected (it's default), don't sort
	            	// SORTING COLUMN "NAME"
	            	// ok, sorting order was already set...by default sort as ASC
	            	cur_records = _.sortBy(cur_records, function(record) {
						return record.name.toLowerCase();
					});	
	            	
	            	// if we need to show our result as DESC, just reverse data
	            	if (this.SORT_TYPE != "desc"){
	            		cur_records = cur_records.reverse();
	            	}
	            }
	            	           
	            if (this.SORT_TYPE_DATE != "None"){															            // sort result list. if None is selected (it's default), don't sort
	            	// SORTING COLUMN "WRITE_DATE"
	            	cur_records = _.sortBy(cur_records, function(record) {
						return record.write_date;
					});
	            	
	            	if (this.SORT_TYPE_DATE != "desc"){
	            		cur_records = cur_records.reverse();
	            	}
	            }
                                
                this.$('.existing-attachments-files').replaceWith(openerp.qweb.render('website.editor.dialog.file.existing.content', {cur_records: cur_records}));
                               
                // set pager buttons
                this.parent.$('.pager')
                    .find('li.previous').toggleClass('disabled', (from === 0)).end()
                    .find('li.next').toggleClass('disabled', (from + per_screen >= records.length));
  
        	}                       
        },
        
        select_existing: function (e) {
            var download = $(e.currentTarget).find('.download');
            var link = download.attr('href')
            var file_name = download.attr('title')
            this.link = link;
            this.file_name = file_name;
            this.selected_existing(link);
        },
        
        selected_existing: function (link) {
            this.$('.existing-attachments-files .file.media_selected').removeClass("media_selected");
            var $select = this.$('.existing-attachments-files .file').filter(function () {
                return $(this).find('.download').attr("href") == link;
            }).first();
            $select.addClass("media_selected");
            return $select;
        },

        try_remove: function (e) {
            var $help_block = this.$('.help-block').empty();
            var self = this;
            var $a = $(e.target);
            var id = parseInt($a.data('id'), 10);
            var attachment = _.findWhere(this.records, {id: id});
            var $both = $a.parent().children();

            $both.css({borderWidth: "5px", borderColor: "#f00"});

            return openerp.jsonRpc('/web/dataset/call_kw', 'call', {
                model: 'ir.attachment',
                method: 'try_remove_file',
                args: [],
                kwargs: {
                    ids: [id],
                    context: website.get_context()
                }
            }).then(function (prevented) {
                if (_.isEmpty(prevented)) {
                    self.records = _.without(self.records, attachment);
                    self.display_attachments();
                    return;
                }
                $both.css({borderWidth: "", borderColor: ""});
                $help_block.replaceWith(openerp.qweb.render(
                    'website.editor.dialog.image.existing.error', {
                        views: prevented[id]
                    }
                ));
            });
        },
    });


})();