<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Operator extends Model
{
    use HasFactory;

    protected $fillable = [
        'full_name',
        'employee_id',
        'department',
        'contact_number',
        'login_pin',
        'is_active',
    ];

    protected $hidden = [
        'login_pin',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
