var Order = function() {
	Form.call(this);
	this.type = 'order';
	this.title = 'Order';
	this.scriptID = 'AKfycbwvVU0gACktGPgO5C_gt9bsGVuYZBwCEWZ9rjOfycGOmT7b-uw';
	this.scriptActions.push('generateInvoice');
	this.scriptActions.push('sendInvoice');
};
Order.prototype = Object.create(Form.prototype);

Order.prototype.init = function() {
	Form.prototype.init.call(this);
	var caller = this;
	$('#copy-billing-button').click(function(e) {
		caller.copyBillingToShipping();
	});
	$('#facilitator-field-template .multiple-template').data('deleteCallback', function($item) {
		var $wrapper = $item.closest('.invoice-item');
		$item.detach();
		caller.updateFacilitatorFees($wrapper);
	});
};

Order.prototype.copyBillingToShipping = function() {
	$('#record-form [name^="Billing "]').each(function() {
		var $this = $(this), name = $this.attr('name');
		var $shippingField = $('#record-form [name="' + name.replace('Billing', 'Shipping') + '"]');
		$shippingField.val($this.val());
	});
};

Order.prototype.postDisplayRecord = function(record) {
	if(record.items) {
		var $wrapper = $('.invoice-item-wrapper').empty(), $template = $('#invoice-item-template > div'), $item, $newItems = $();
		for(var i = 0; i < record.items.length; i++) {
			var item = record.items[i];
			$item = $template.clone().appendTo($wrapper), code = item['Item Code'].replace(/ /g, ''), account = code.split('-')[0];
			for(var field in item) if(item.hasOwnProperty(field)) {
				if(field == 'Facilitators') continue;
				$item.find('[name="' + field + '[]"]').val(item[field]);
			}
			$item.find('.item-delete').removeClass('hidden');
			//additional fields
			$item.find('.invoice-additional-fields > div').filter(function() {
				var include = $(this).attr('accounts'), exclude = $(this).attr('accounts-exclude');
				if(include) include = include.split(' ');
				if(exclude) exclude = exclude.split(' ');
				return include.indexOf(code) >= 0 || (include.indexOf(account) >= 0 && exclude.indexOf(code) < 0);
			}).removeClass('hidden');
			if(item['Facilitators'].length > 0) {
				var facilitators = item['Facilitators'].split(', '), $wrap = $item.find('.facilitator-field-wrapper'),
					$temp = $('#facilitator-field-template > .multiple-template');
				for(var j = facilitators.length-1; j >= 0; j--) {
					var $copy = $temp.clone();
					$copy.find('.facilitator-delete').removeClass('hidden');
					$copy.find('[name="Facilitators[]"]').val(facilitators[j]);
					$wrap.prepend($copy);
				}
			}
			$newItems = $newItems.add($item);
		}
		$item = $template.clone().appendTo($wrapper);
		$newItems = $newItems.add($item);
		this.processElements($newItems);
	}
	if(record.Invoice) {
		$('#invoice-url').val('https://docs.google.com/spreadsheets/d/' + record.Invoice + '/edit');
	} else {
		$('#editInvoice-button,#sendInvoice-button').attr('disabled', true);
	}
};

Order.prototype.recordString = function(record) {
	var str = record['Billing Organization'];
	if(record['Billing Name']) str += ' (' + record['Billing Name'] + ')';
	return str;
};

Order.prototype.recordAction = function(action) {
	Form.prototype.recordAction.call(this, action);
	switch(action) {
		case 'editInvoice':
			var win = window.open($('#invoice-url').val(), '_blank');
			if(win) win.focus();
			break;
		default: break;
	}
};

Order.prototype.processElements = function(root) {
	var caller = this;
	Form.prototype.processElements.call(this, root);
	$('.item-code', root).change(function(event) {
		//set the item description to its title by default
		var $target = $(event.target), $item = $target.closest('.invoice-item');
		var catalog = $target.find(':selected').attr('catalog');
		catalog = JSON.parse(decodeURIComponent(catalog));
		var description = catalog['Item Description'];
		$item.find('.item-description').val(description);
		if(description == 'Mileage Reimbursement') {
			$item.find('.item-price').val(0);
		} else {
			$item.find('.item-price').val(catalog['Base Price']);
		}
		//show the additional fields corresponding to the item code
		var code = $target.find(':selected').val(), account = code.split(' ')[0];
		code = code.replace(/ /g, '');
		var $fields = $item.find('.invoice-additional-fields > div');
		$fields.each(function() {
			var $this = $(this), codes = $this.attr('accounts'), exclude = $this.attr('accounts-exclude');
			codes = codes ? codes.split(' ') : [];
			exclude = exclude ? exclude.split(' ') : [];
			if(codes.indexOf(code) >= 0 || (codes.indexOf(account) >= 0 && exclude.indexOf(code) < 0)) $this.removeClass('hidden');
			else $this.addClass('hidden');
		});
	});
	//recalculate mileage reimbursement
	$('.item-mileage', root).change(function(event) {
		var $target = $(event.target), $item = $target.closest('.invoice-item');
		var $mileage = $item.find('.item-code').find('[value="OE - MR"]');
		var mileage = JSON.parse(decodeURIComponent($mileage.attr('catalog')));
		var price = parseFloat(mileage['Base Price']) * parseFloat($target.val());
		$item.find('.item-price').val(price.toFixed(2));
	});
	//recalculate facilitator fees
	$('.facilitator-person', root).change(function(event) {
		caller.updateFacilitatorFees(this);
	});
	$('.invoice-event-date,.invoice-start-time,.invoice-end-time', root).each(function() {
		var element = this, $element = $(this);
		$element.on('dp.change', function(event) {
			var value = $element.find('input').val();
			if($element.hasClass('invoice-start-time')) {
				var $end = $element.closest('.invoice-item').find('.invoice-end-time input');
				var current = $end.val();
				if(current) {
					var start = moment(value, Form.TIME_FORMAT).valueOf(),
						end = moment(current, Form.TIME_FORMAT).valueOf();
					if(start > end) $end.val(value);
				}
				else $end.val(value);
			}
			caller.updateFacilitatorFees(element);
		});
	});
};

Order.prototype.updateFacilitatorFees = function(element) {
	var $item = $(element).closest('.invoice-item');
	var $facilitators = $item.find('.facilitator-field-wrapper'), numFacilitators = $facilitators.find('option:selected[value!=""]').length;
	var date = $item.find('input[name="Event Date[]"]').val(), startTime = $item.find('input[name="Start Time[]"]').val(),
		endTime = $item.find('input[name="End Time[]"]').val(), duration = 0;
	if(date && startTime && endTime) {
		var start = moment(date + ' ' + startTime, Form.DATE_FORMAT + ' ' + Form.TIME_FORMAT),
			end = moment(date + ' ' + endTime, Form.DATE_FORMAT + ' ' + Form.TIME_FORMAT);
		duration = (end - start) / (3600000);
	}
	var catalog = JSON.parse(decodeURIComponent($item.find('.item-code option:selected').attr('catalog'))),
		basePrice = parseInt(catalog['Base Price']), price = basePrice;
	if(duration >= 6) {
		if(basePrice == 500) price = 900;
		else if(basePrice == 750) price = 1200;
	}
	if(numFacilitators > 1) {
		price += (numFacilitators-1) * Math.floor(duration) * 100;
	}
	$item.find('.item-price').val(price);
};

$(document).ready(function() {
	var form = new Order();
	Form.setForm(form);
	form.init();
});
