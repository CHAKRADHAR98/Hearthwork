#[macro_export]
macro_rules! check_zero {
    ($arr:expr) => {
        if $arr.iter().any(|amount| *amount == Decimal::ZERO) {
            return err!(GatherError::ZeroAmount);
        }
    };
}

#[macro_export]
macro_rules! add_or_sub {
    ($value_one:expr, $value_two:expr, $is_add:expr) => {
        if $is_add {
            match $value_one.checked_add($value_two) {
                Some(val) => Ok(val),
                None => err!(GatherError::ArthemeticOverflow),
            }
        } else {
            match $value_one.checked_sub($value_two) {
                Some(val) => Ok(val),
                None => err!(GatherError::ArthemeticUnderflow),
            }
        }
    };
}

#[macro_export]
macro_rules! div {
    ($value_one:expr,$value_two:expr) => {
        match $value_one.checked_div($value_two) {
            Some(val) => val,
            None => return Err(GatherError::ArthemeticError.into()),
        }
    };
}

#[macro_export]
macro_rules! mul {
    ($value_one:expr,$value_two:expr) => {
        match $value_one.checked_mul($value_two) {
            Some(val) => val,
            None => return err!(GatherError::ArthemeticOverflow),
        }
    };
}

#[macro_export]
macro_rules! decimal_convo {
    ($value:expr) => {
        Decimal::from($value)
    };
}

#[macro_export]
macro_rules! check_ban {
    ($ban:expr) => {
        if $ban {
            return err!(GatherError::Banned);
        }
    };
}

#[macro_export]
macro_rules! admin_check {
    ($self:expr) => {
        let admin_check = $self
            .gather_config
            .admin
            .iter()
            .any(|admin_pubkey| $self.admin.key() == *admin_pubkey);

        if !admin_check {
            return err!(GatherError::UnAuthourized);
        }
    };
}
